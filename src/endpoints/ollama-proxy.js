import express from 'express';
import { trimV1 } from '../util.js';

export const router = express.Router();

// This endpoint allows external access to Ollama through SillyTavern
router.post('/generate', async (request, response) => {
  try {
    console.log('⚡ Received generate request:', request.body);
    const ollamaUrl = 'http://127.0.0.1:11434';
    
    // Forward the request to Ollama
    const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
    });
    
    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error('❌ Ollama proxy error:', ollamaResponse.status, errorText);
      return response.status(ollamaResponse.status).send(errorText);
    }
    
    // Return the Ollama response
    const data = await ollamaResponse.json();
    console.log('✅ Ollama generate response received');
    return response.send(data);
  } catch (error) {
    console.error('❌ Ollama proxy error:', error);
    return response.status(500).send({ error: error.message });
  }
});

// NEW ENDPOINT: Generate text with a character card
router.post('/generate-with-character', async (request, response) => {
  try {
    console.log('⚡ Received generate-with-character request');
    const ollamaUrl = 'http://127.0.0.1:11434';
    
    // Extract the request body components
    const { model, prompt, character_data, chat_history = [] } = request.body;
    
    if (!model || !prompt || !character_data) {
      return response.status(400).send({ 
        error: 'Missing required parameters. Please provide "model", "prompt", and "character_data".'
      });
    }
    
    // Validate character data (minimal V1 structure)
    if (!character_data.name || !character_data.personality) {
      return response.status(400).send({ 
        error: 'Invalid character data. At minimum, "name" and "personality" fields are required.'
      });
    }
    
    // Build a proper prompt using the character data
    const userName = request.body.user_name || 'User';
    let systemPrompt = buildSystemPrompt(character_data, userName);
    let fullPrompt = buildFullPrompt(systemPrompt, character_data, userName, prompt, chat_history);
    
    console.log('📝 Built character prompt');
    
    // Forward the request to Ollama with our constructed prompt
    const ollamaRequest = {
      model: model,
      prompt: fullPrompt,
      stream: request.body.stream || false,
      options: request.body.options || {}
    };
    
    console.log('🚀 Sending request to Ollama');
    const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });
    
    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error('❌ Ollama character proxy error:', ollamaResponse.status, errorText);
      return response.status(ollamaResponse.status).send(errorText);
    }
    
    // Return the Ollama response
    const data = await ollamaResponse.json();
    console.log('✅ Ollama character response received');
    
    // Add character name to response
    const enhancedResponse = {
      ...data,
      character_name: character_data.name 
    };
    
    return response.send(enhancedResponse);
  } catch (error) {
    console.error('❌ Ollama character proxy error:', error);
    return response.status(500).send({ error: error.message });
  }
});

// Get available models
router.get('/models', async (request, response) => {
  try {
    console.log('⚡ Received models request');
    const ollamaUrl = 'http://127.0.0.1:11434';
    
    const ollamaResponse = await fetch(`${ollamaUrl}/api/tags`);
    
    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error('❌ Ollama models error:', ollamaResponse.status, errorText);
      return response.status(ollamaResponse.status).send(errorText);
    }
    
    const data = await ollamaResponse.json();
    console.log('✅ Ollama models response received');
    return response.send(data);
  } catch (error) {
    console.error('❌ Ollama models error:', error);
    return response.status(500).send({ error: error.message });
  }
});

/**
 * Builds a system prompt from character data
 * @param {object} character - Character data in V1 format
 * @param {string} userName - Name of the user
 * @returns {string} System prompt for the AI
 */
function buildSystemPrompt(character, userName) {
  const sections = [];
  
  // Add relevant character information
  if (character.description) {
    sections.push(`Description: ${character.description}`);
  }
  
  if (character.personality) {
    sections.push(`Personality: ${character.personality}`);
  }
  
  if (character.scenario) {
    sections.push(`Scenario: ${character.scenario}`);
  }
  
  // Creator notes if available
  if (character.creatorcomment) {
    sections.push(`Additional notes: ${character.creatorcomment}`);
  }
  
  // Base system instructions
  const systemInstructions = `You are ${character.name}, and you're having a conversation with ${userName}.
Always respond as ${character.name}, maintaining the character's personality and background.
Never break character or refer to yourself as an AI or language model.
If the character has a specific speech pattern, writing style, or verbal tics, emulate those in your responses.`;

  return `### Instructions for the AI ###
${systemInstructions}

### ${character.name}'s Character Information ###
${sections.join('\n\n')}

### Example Messages ###
${character.mes_example || ''}`;
}

/**
 * Builds a complete prompt for the AI
 * @param {string} systemPrompt - System prompt for context
 * @param {object} character - Character data
 * @param {string} userName - User's name
 * @param {string} userPrompt - Current user message
 * @param {Array} chatHistory - Previous messages in the conversation
 * @returns {string} Full prompt for the AI
 */
function buildFullPrompt(systemPrompt, character, userName, userPrompt, chatHistory) {
  // Start with system prompt
  let fullPrompt = systemPrompt + "\n\n";
  
  // Add first message if available and no chat history
  if (character.first_mes && chatHistory.length === 0) {
    fullPrompt += `${character.name}: ${character.first_mes}\n\n`;
  }
  
  // Add chat history
  if (chatHistory && chatHistory.length > 0) {
    for (const message of chatHistory) {
      const speaker = message.role === 'user' ? userName : character.name;
      fullPrompt += `${speaker}: ${message.content}\n\n`;
    }
  }
  
  // Add current prompt
  fullPrompt += `${userName}: ${userPrompt}\n\n${character.name}:`;
  
  return fullPrompt;
} 
