import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { isFreeTierModel, useKeyTier } from "./key-tier";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const keyTier = useKeyTier();
  const models = useMemo(() => {
    const all = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    // with the free key, only models covered by the free program are offered
    if (keyTier === "free") {
      return all.map((m) =>
        isFreeTierModel(m.name, m.provider?.providerName)
          ? m
          : { ...m, available: false },
      );
    }
    return all;
  }, [
    accessStore.customModels,
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    keyTier,
  ]);

  return models;
}
