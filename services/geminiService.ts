
import { GoogleGenAI } from "@google/genai";
import { Player } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd handle this more gracefully.
  // For this context, we assume API_KEY is always available.
  console.warn("API_KEY not found in environment variables. Gemini features will not work.");
}

// We check for API_KEY presence but create the instance on-demand
// to ensure it's available in environments where it might be set later.
let ai: GoogleGenAI | null = null;
const getAi = () => {
    if (!ai && API_KEY) {
        ai = new GoogleGenAI({ apiKey: API_KEY });
    }
    return ai;
}


export const getPlayerAnalysis = async (player: Player): Promise<string> => {
    const genAI = getAi();
    if (!genAI) {
        return Promise.resolve("Gemini API key not configured. Please set the API_KEY environment variable.");
    }
    
    const model = 'gemini-2.5-flash';
    const prompt = `
        You are an expert fantasy football analyst providing a draft recommendation.
        Analyze the following player for the upcoming season in a concise summary.
        
        Player: ${player.name}
        Position: ${player.position}
        Team: ${player.team}
        
        Provide the analysis in markdown format with the following sections:
        - **Upside:** A brief sentence on their potential ceiling.
        - **Risks:** A brief sentence on potential risks or concerns.
        - **Verdict:** A concluding recommendation for where they should be considered in a draft.
    `;

    try {
        const response = await genAI.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error fetching player analysis:", error);
        return "An error occurred while fetching analysis from Gemini. Please check the console for details.";
    }
};
