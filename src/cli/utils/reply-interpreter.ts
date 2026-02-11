import { promises as fs } from 'fs';
import path from 'path';
import { runGeminiPrompt } from '../../ai/gemini';
import { prompts } from '../../ai/prompts';
import { getLogsDir } from './storage-files';

export type ReplyIntent = {
  intent: 'confirm' | 'deny' | 'ask_again' | 'ambiguous';
  instruction: string | null;
  matchedTerm: string | null;
  source: 'local' | 'ai';
};

type Lexicon = {
  confirm: string[];
  deny: string[];
  askAgain: string[];
};

const DEFAULT_LEXICON: Lexicon = {
  confirm: ['sim', 'claro', 'pode', 'ok', 'perfeito', 'manda', 'aham', 'beleza', 'vai', 'pode sim'],
  deny: ['nao', 'não', 'ainda nao', 'ainda não', 'pare', 'cancela', 'depois', 'agora nao', 'agora não'],
  askAgain: ['pergunte', 'me lembra', 'depois me pergunta', 'me avisa depois']
};

const lexiconPath = () => path.join(getLogsDir(), 'lexicon.json');

const normalize = (text: string) => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const loadLexicon = async (): Promise<Lexicon> => {
  try {
    const data = await fs.readFile(lexiconPath(), 'utf-8');
    const parsed = JSON.parse(data) as Partial<Lexicon>;
    return {
      confirm: parsed.confirm ?? DEFAULT_LEXICON.confirm,
      deny: parsed.deny ?? DEFAULT_LEXICON.deny,
      askAgain: parsed.askAgain ?? DEFAULT_LEXICON.askAgain
    };
  } catch {
    return DEFAULT_LEXICON;
  }
};

const saveLexicon = async (lexicon: Lexicon) => {
  await fs.mkdir(getLogsDir(), { recursive: true });
  await fs.writeFile(lexiconPath(), JSON.stringify(lexicon, null, 2));
};

const findMatch = (text: string, words: string[]) => {
  const normalized = normalize(text);
  return words.find((word) => normalized.includes(normalize(word))) ?? null;
};

const shouldAskAi = (reply: string) => {
  const length = reply.trim().length;
  const hasNumber = /\d/.test(reply);
  const hasComma = reply.includes(',') || reply.includes(';');
  return length >= 20 || hasNumber || hasComma;
};

const parseAiResponse = (response: string): ReplyIntent => {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response missing JSON');
  }
  const parsed = JSON.parse(jsonMatch[0]) as { intent?: string; instruction?: string | null; matchedTerm?: string | null };
  const intent = parsed.intent === 'confirm' || parsed.intent === 'deny' || parsed.intent === 'ask_again'
    ? parsed.intent
    : 'ambiguous';
  return {
    intent,
    instruction: parsed.instruction ?? null,
    matchedTerm: parsed.matchedTerm ?? null,
    source: 'ai'
  };
};

export const interpretUserReply = async (input: {
  question: string;
  reply: string;
  context?: string;
}): Promise<ReplyIntent> => {
  const aiEnabled = process.env.ELO_AI_REPLY === 'true';
  const lexicon = await loadLexicon();
  const reply = normalize(input.reply);

  const confirmMatch = findMatch(reply, lexicon.confirm);
  const denyMatch = findMatch(reply, lexicon.deny);
  const askMatch = findMatch(reply, lexicon.askAgain);
  const isConfirm = Boolean(confirmMatch);
  const isDeny = Boolean(denyMatch);
  const isAskAgain = Boolean(askMatch);

  if (aiEnabled && (isConfirm || isDeny || isAskAgain) && shouldAskAi(input.reply)) {
    const prompt = prompts.interpretUserReply({
      question: input.question,
      reply: input.reply,
      context: input.context
    });
    const response = await runGeminiPrompt(prompt, {
      thinkingBudget: 0,
      metadata: {
        source: 'chat:reply_interpreter',
        tags: ['chat', 'approval'],
        extra: {
          questionChars: input.question.length,
          replyChars: input.reply.length,
          contextChars: input.context ? input.context.length : 0,
          hasInitialMatch: true
        }
      }
    });
    return parseAiResponse(response);
  }

  if (isConfirm && !isDeny) {
    if (confirmMatch && !lexicon.confirm.includes(confirmMatch)) {
      lexicon.confirm.push(confirmMatch);
      await saveLexicon(lexicon);
    }
    return { intent: 'confirm', instruction: null, matchedTerm: confirmMatch ?? null, source: 'local' };
  }

  if (isDeny && !isConfirm) {
    if (denyMatch && !lexicon.deny.includes(denyMatch)) {
      lexicon.deny.push(denyMatch);
      await saveLexicon(lexicon);
    }
    return { intent: 'deny', instruction: null, matchedTerm: denyMatch ?? null, source: 'local' };
  }

  if (isAskAgain) {
    if (askMatch && !lexicon.askAgain.includes(askMatch)) {
      lexicon.askAgain.push(askMatch);
      await saveLexicon(lexicon);
    }
    return { intent: 'ask_again', instruction: null, matchedTerm: askMatch ?? null, source: 'local' };
  }

  if (aiEnabled) {
    const prompt = prompts.interpretUserReply({
      question: input.question,
      reply: input.reply,
      context: input.context
    });
    const response = await runGeminiPrompt(prompt, {
      thinkingBudget: 0,
      metadata: {
        source: 'chat:reply_interpreter',
        tags: ['chat', 'approval'],
        extra: {
          questionChars: input.question.length,
          replyChars: input.reply.length,
          contextChars: input.context ? input.context.length : 0,
          hasInitialMatch: false
        }
      }
    });
    const parsed = parseAiResponse(response);
    if (parsed.matchedTerm) {
      const normalized = normalize(parsed.matchedTerm);
      if (parsed.intent === 'confirm' && !lexicon.confirm.includes(normalized)) {
        lexicon.confirm.push(normalized);
      }
      if (parsed.intent === 'deny' && !lexicon.deny.includes(normalized)) {
        lexicon.deny.push(normalized);
      }
      if (parsed.intent === 'ask_again' && !lexicon.askAgain.includes(normalized)) {
        lexicon.askAgain.push(normalized);
      }
      await saveLexicon(lexicon);
    }
    return parsed;
  }

  return { intent: 'ambiguous', instruction: null, matchedTerm: null, source: 'local' };
};
