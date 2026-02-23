import { GoogleGenAI, Modality } from "@google/genai";

const apiKey =
  import.meta.env.VITE_GEMINI_API_KEY ||
  import.meta.env.VITE_GOOGLE_API_KEY ||
  "";

export const ai = new GoogleGenAI({ apiKey });
export { Modality };
