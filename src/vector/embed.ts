const MODEL = 'Xenova/all-MiniLM-L6-v2';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipeline(): Promise<any> {
  if (!_pipeline) {
    const { pipeline } = await import('@xenova/transformers');
    _pipeline = await pipeline('feature-extraction', MODEL, { quantized: true });
  }
  return _pipeline;
}

// 将文本转换为 384 维 float32 向量
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}
