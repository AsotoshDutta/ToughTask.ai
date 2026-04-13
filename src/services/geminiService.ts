import { GoogleGenAI, Type } from "@google/genai";
import { Toughness, Duration, TaskActivity, AgeGroup } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function generateTask(niche: string, toughness: Toughness, ageGroup: AgeGroup, duration: Duration): Promise<Partial<TaskActivity>> {
  const prompt = `Generate a challenging but doable task for a user.
  Niche: ${niche}
  Toughness: ${toughness}
  Age Group: ${ageGroup}
  Duration: ${duration}
  
  The task should be specific, actionable, and have ZERO endangerment.
  If it's a physical task, ensure it's within normal human limits for the given toughness and age group.
  If it's a mental task, ensure it's intellectually stimulating and age-appropriate.
  
  Provide a catchy title and a clear description.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["title", "description"],
      },
    },
  });

  const result = JSON.parse(response.text);
  return {
    title: result.title,
    description: result.description,
    niche,
    toughness,
    ageGroup,
    duration,
    status: 'pending',
  };
}
