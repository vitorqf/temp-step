import Habit from "@/components/Habit";
import StepCounter from "@/components/StepCounter";
import Tabs from "@/components/Tabs";
import { Colors } from "@/constants/Colors";
import useHabit from "@/hooks/useHabit";
import useStepSync from "@/hooks/useStepSync";
import { getFitInfosDataForToday } from "@/storage/sqliteHelpers";
import {
  isStepCountingSupported,
  parseStepData,
  startStepCounterUpdate,
  stopStepCounterUpdate,
  type ParsedStepCountData,
} from "@dongminyu/react-native-step-counter";
import { useSQLiteContext } from "expo-sqlite";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/Header";

type SensorType<T = typeof Platform.OS> = T extends "ios"
  ? "CMPedometer"
  : T extends "android"
    ? "Step Counter" | "Accelerometer"
    : "NONE";

type SensorName = SensorType<Platform["OS"]>;

const initState = {
  stepsString: "0 steps",
  calories: "0 kCal",
  distance: "0.0 m",
};

type AdditionalInfo = Partial<ParsedStepCountData>;

export default function Fit() {
  const {
    TABS,
    currentTab,
    setCurrentTab,
    fitHabits,
    habitFitError,
    habitFitIsLoading,
    addFitPositiveCounterMutation,
    addFitNegativeCounterMutation,
  } = useHabit();

  const [supported, setSupported] = React.useState(false);
  const [granted, setGranted] = React.useState(false);
  const [sensorType, setSensorType] = React.useState<SensorName>("NONE");
  const [stepsFromDB, setStepsFromDB] = useState(0);
  const [stepsFromSensor, setStepsFromSensor] = useState(0);

  const initialSensorValue = useRef<number | null>(null);
  const [additionalInfo, setAdditionalInfo] = React.useState<AdditionalInfo>(initState);
  const db = useSQLiteContext();

  const isPedometerSupported = () => {
    isStepCountingSupported().then((result) => {
      setGranted(result.granted === true);
      setSupported(result.supported === true);
    });
  };

  const stopStepCounter = () => {
    setAdditionalInfo(initState);
    stopStepCounterUpdate();
  };

  useEffect(() => {
    const loadStepsFromDB = async () => {
      const today = new Date().toISOString().split("T")[0];
      const data = await getFitInfosDataForToday(today, db); // lê do SQLite

      console.log("database data", data.steps, data.sensorStepsRaw, today);

      setStepsFromDB(data.steps);
    };
    loadStepsFromDB();
  }, [db]);

  const today = new Date();
  today.setDate(today.getDate() - 1);

  useEffect(() => {
    isPedometerSupported();
    const startStepCounter = () => {
      startStepCounterUpdate(today, (data) => {
        console.log("steps", data.steps);
        if (initialSensorValue.current === null) {
          initialSensorValue.current = data.steps;
          return;
        }
        const delta = data.steps - initialSensorValue.current;

        if (delta >= 0) {
          setStepsFromSensor(delta);
        }

        const parsedData = parseStepData(data);

        setSensorType(data.counterType as SensorName);
        setAdditionalInfo({
          ...parsedData,
        });
      });
    };
    startStepCounter();

    return () => {
      stopStepCounter();
    };
  }, []);

  const totalSteps = stepsFromDB + stepsFromSensor;

  // useEffect(() => {
  //   startStepCounter();
  // }, [granted, startStepCounter, supported]);

  const parseValidFitInfo = (value: string | undefined): number => {
    if (!value) return 0;
    // Extrai números antes de qualquer letra (kCal, m, etc)
    const match = value.match(/^([\d.]+)/);
    return match ? Number(match[1]) : 0;
  };

  const fitInfo = useMemo(() => {
    return {
      steps: totalSteps,
      kcal: parseValidFitInfo(additionalInfo.calories),
      distance: parseValidFitInfo(additionalInfo.distance),
    };
  }, [additionalInfo.calories, additionalInfo.distance, totalSteps]);

  useStepSync(fitInfo);

  return (
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 30, flexGrow: 1 }}>
      <Header />
      <View style={{ justifyContent: "center", alignItems: "center", marginTop: 20 }}>
        <StepCounter steps={totalSteps} goal={1050} size={250} strokeWidth={15} />
      </View>
      <View>
        <Text>{additionalInfo.calories}</Text>
        <Text>{additionalInfo.distance}</Text>
      </View>

      <View style={{ marginTop: 35, marginBottom: 25 }}>
        <Tabs tabs={TABS} initialTabKey="habit" onTabChange={(key: string) => setCurrentTab(key)} />
      </View>

      {habitFitIsLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size={50} />
        </View>
      )}

      {currentTab === "habit" ? (
        <FlatList
          data={fitHabits || []}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.habitTodoContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Habit
              habit={item}
              onPressPositive={() => {
                addFitPositiveCounterMutation.mutate(item.id);
              }}
              onPressEdit={() => {}}
              onPressNegative={() => {
                addFitNegativeCounterMutation.mutate(item.id);
              }}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: Colors.light.darkGray, textAlign: "center" }}>
              Nenhum hábito encontrado.
            </Text>
          }
        />
      ) : (
        <View style={styles.habitTodoContainer}>
          <Text style={{ color: "black" }}>Tarefas</Text>
        </View>
      )}

      {habitFitError && (
        <View style={styles.errorContent}>
          <Text style={{ color: Colors.light.redColor }}>Não foi possível carregar os hábitos</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  habitTodoContainer: {
    gap: 10,
    width: "100%",
    paddingBottom: 230,
  },
  errorContent: {
    alignItems: "center",
  },
});
