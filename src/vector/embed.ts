/**
 * Google Embedding API（text-embedding-004，768 维）
 * 需要设置环境变量 GOOGLE_API_KEY
 */

const MODEL = 'text-embedding-004';

export async function embed(text: string): Promise<Float32Array> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 未设置，请在 OpenClaw 插件配置中添加');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Embedding API 错误 ${res.status}: ${body}`);
  }

  const data = await res.json() as { embedding: { values: number[] } };
  return new Float32Array(data.embedding.values);
}
