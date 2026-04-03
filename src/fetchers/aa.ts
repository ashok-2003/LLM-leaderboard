export interface AAModel {
  id: string;
  name: string;
  slug: string;
  model_creator: { id: string; name: string; slug: string };
  evaluations: {
    artificial_analysis_intelligence_index?: number | null;
    artificial_analysis_coding_index?: number | null;
    artificial_analysis_math_index?: number | null;
    mmlu_pro?: number | null;
    gpqa?: number | null;
    hle?: number | null;
    livecodebench?: number | null;
    scicode?: number | null;
    math_500?: number | null;
    aime?: number | null;
  };
  pricing?: {
    price_1m_blended_3_to_1?: number | null;
    price_1m_input_tokens?: number | null;
    price_1m_output_tokens?: number | null;
  };
  median_output_tokens_per_second?: number | null;
  median_time_to_first_token_seconds?: number | null;
}

export async function fetchAAModels(apiKey: string): Promise<AAModel[]> {
  const res = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`AA API error: ${res.status} ${res.statusText}`);
  const body = await res.json();
  return Array.isArray(body) ? body : body.data ?? body.models ?? [];
}
