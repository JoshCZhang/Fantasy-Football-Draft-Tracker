
import { GoogleGenAI } from "@google/genai";
import { Player } from "../types";

// Initialize the Gemini AI client once at the module level.
// This prevents re-creating the client on every function call.
const ai = process.env.API_KEY ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null;

if (!ai) {
  // This warning is for the developer running the application.
  console.warn("API_KEY not found in environment variables. Gemini features will not work.");
}


export const getPlayerAnalysis = async (player: Player): Promise<string> => {
    // Return an error message if the API key isn't configured.
    if (!ai) {
        return "Gemini API key not configured. Please set the API_KEY environment variable.";
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
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error fetching player analysis:", error);
        return "An error occurred while fetching analysis from Gemini. Please check the console for details.";
    }
};
