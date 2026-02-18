import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { resolve } from 'path';
import { Store } from './db/index.js';
import { createSessionRouter } from './routes/session.js';
import { createFilesRouter } from './routes/files.js';
import { isLLMConfigured, loadLLMConfig } from './services/llm.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const store = new Store(DATA_DIR);

app.use('/api/session', createSessionRouter(store, DATA_DIR));
app.use('/api', createFilesRouter(store, DATA_DIR));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const llmConfig = loadLLMConfig(DATA_DIR);
  if (isLLMConfigured(llmConfig)) {
    console.log(`LLM: ${llmConfig.model} via ${llmConfig.baseURL}`);
  } else {
    console.log('LLM: NOT CONFIGURED (set LLM_API_KEY in .env or configure via UI). File features work without it.');
  }
});
