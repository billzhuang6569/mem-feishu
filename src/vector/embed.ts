/**
 * Google Embedding API（gemini-embedding-2-preview，768 维输出）
 * 需要设置环境变量 GOOGLE_API_KEY
 */

const MODEL = 'gemini-embedding-2-preview';
// 指定输出维度为 768，与本地 SQLite 向量表匹配
const OUTPUT_DIMENSIONALITY = 768;

export async function embed(text: string): Promise<Float32Array> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 未设置，请在 OpenClaw 插件配置中添加');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: OUTPUT_DIMENSIONALITY,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Embedding API 错误 ${res.status}: ${body}`);
  }

  const data = await res.json() as { embedding: { values: number[] } };
  return new Float32Array(data.embedding.values);
}
