import { GoogleGenAI, Type } from "@google/genai";
import { CellValue } from './types';

// Initialize Gemini Client
const apiKey = process.env.API_KEY || ''; // Accessed via safe env var
const ai = new GoogleGenAI({ apiKey });

export const findSemanticMatches = async (
  referenceValues: string[],
  targetValues: string[]
): Promise<Array<{ target: string; match: string; confidence: string }>> => {
  
  if (!apiKey) {
    console.error("API Key not found");
    // Return empty matches if no key (or handle gracefully in UI)
    return targetValues.map(t => ({ target: t, match: '', confidence: 'Low' }));
  }

  // To avoid token limits and ensure speed, we batch requests if lists are long.
  // For this demo, we'll take the top 20 distinct values to demonstrate.
  const uniqueRefs = Array.from(new Set(referenceValues)).slice(0, 50);
  const uniqueTargets = Array.from(new Set(targetValues)).slice(0, 20);

  const prompt = `
    You are an expert data reconciliation engine.
    
    Task: Match items from the "Target List" to the best corresponding item in the "Reference List".
    The match might be exact, a short form, an abbreviation, a typo, or a semantic equivalent (e.g., "IBM" matches "International Business Machines").
    
    Reference List:
    ${JSON.stringify(uniqueRefs)}
    
    Target List:
    ${JSON.stringify(uniqueTargets)}
    
    Return a JSON array of objects. Each object must have:
    - "target": The value from the Target List.
    - "match": The best match from the Reference List. If no reasonable match exists, return null.
    - "confidence": "High", "Medium", or "Low" based on your certainty.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              target: { type: Type.STRING },
              match: { type: Type.STRING, nullable: true },
              confidence: { type: Type.STRING } // Enums not strictly enforced in basic schema gen yet, stick to string
            },
            required: ["target", "confidence"]
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return [];
    
    const parsed = JSON.parse(resultText);
    return parsed;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
};