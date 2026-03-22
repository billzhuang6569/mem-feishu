const MODEL = 'Xenova/all-MiniLM-L6-v2';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipeline(): Promise<any> {
  if (!_pipeline) {
    const transformers = await import('@xenova/transformers');
    const { pipeline, env } = transformers;

    // 强制使用 onnxruntime-web（WASM），避免 onnxruntime-node 的 native binary 依赖
    // 这使得国内用户无需安装 onnxruntime-node 即可运行
    env.backends.onnx.wasm.proxy = false;

    // 支持国内 Hugging Face 镜像（HF_ENDPOINT 环境变量）
    // 示例：HF_ENDPOINT=https://hf-mirror.com
    if (process.env.HF_ENDPOINT) {
      env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, '') + '/';
    }

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
