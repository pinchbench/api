import { MODEL_METADATA } from "../data/modelMetadata";

type ModelMetadata = (typeof MODEL_METADATA)[number];

const metadataByKey = new Map(
  MODEL_METADATA.map((meta) => [`${meta.model}|${meta.provider}`, meta]),
);
const metadataByModel = new Map(
  MODEL_METADATA.map((meta) => [meta.model, meta]),
);

export const getModelMetadata = (
  model: string,
  provider?: string | null,
): ModelMetadata | undefined => {
  if (provider) {
    const byKey = metadataByKey.get(`${model}|${provider}`);
    if (byKey) {
      return byKey;
    }
  }

  return metadataByModel.get(model);
};
