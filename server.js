const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const translationCache = new NodeCache({ stdTTL: 3600 });

const app = express();
app.use(express.json());

const API_KEY = "your-secret-key-123";

// API Key Middleware
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ 
      error: "Unauthorized",
      received: req.headers['x-api-key'],
      expected: API_KEY
    });
  }
  next();
});

// Tools registry (MCP-style functionality)
const tools = {
  "get-chuck-joke": {
    description: "Get a random Chuck Norris joke",
    handler: async () => {
      const response = await fetch("https://api.chucknorris.io/jokes/random");
      const data = await response.json();
      return {
        joke: data.value,
        iconUrl: data.icon_url
      };
    }
  },
  "get-chuck-joke-by-category": {
    description: "Get a random Chuck Norris joke by category",
    handler: async (params) => {
      if (!params?.category) {
        throw new Error("Category parameter is required");
      }
      const response = await fetch(
        `https://api.chucknorris.io/jokes/random?category=${params.category}`
      );
      const data = await response.json();
      return {
        joke: data.value,
        iconUrl: data.icon_url
      };
    }
  },
  "get-chuck-categories": {
    description: "Get all available categories for Chuck Norris jokes",
    handler: async () => {
      const response = await fetch("https://api.chucknorris.io/jokes/categories");
      const data = await response.json();
      return {
        categories: data
      };
    }
  },
  "get-dad-joke": {
    description: "Get a random dad joke",
    handler: async () => {
      const response = await fetch("https://icanhazdadjoke.com/", {
        headers: {
          Accept: "application/json",
        },
      });
      const data = await response.json();
      return {
        joke: data.joke
      };
    }
  },

"lingva-translate": {
    description: "Translate text using Lingva API (free/open-source)",
    handler: async (params) => {
      const { text, sourceLang = 'en', targetLang = 'es' } = params;
      
      if (!text) throw new Error("Text parameter is required");

      // Encode text for URL safety
      const encodedText = encodeURIComponent(text);
      const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodedText}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Lingva API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        originalText: text,
        translatedText: data.translation,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        api: "Lingva"
      };
    }
  },

  "mymemory-translate": {
    description: "Translate text using MyMemory API with caching",
    handler: async (params) => {
      const { text, sourceLang = 'en', targetLang = 'es' } = params;
      
      // Validate input
      if (!text) throw new Error("Text parameter is required");

      // Check cache first
      const cacheKey = `${sourceLang}-${targetLang}-${text}`;
      const cached = translationCache.get(cacheKey);
      if (cached) return cached;

      // Call MyMemory API
      const encodedText = encodeURIComponent(text);
      const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`MyMemory API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate response
      if (!data.responseData?.translatedText) {
        throw new Error("Invalid translation response");
      }

      // Prepare and cache result
      const result = {
        originalText: text,
        translatedText: data.responseData.translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        match: data.responseData.match || 0,
        api: "MyMemory"
      };
      translationCache.set(cacheKey, result);
      
      return result;
    }
  }
  //======================================

};

// Original echo endpoint
app.post('/actions/echo', async (req, res) => {
  try {
    // Get Chuck Norris joke
    const jokeResponse = await fetch("https://api.chucknorris.io/jokes/random");
    const jokeData = await jokeResponse.json();
    
    // Prepare response
    const response = {
      originalMessage: req.body.message || "No message provided",
      chuckJoke: jokeData.value,
      iconUrl: jokeData.icon_url,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: "Failed to process request",
      details: error.message 
    });
  }
});

// MCP-style execute endpoint
app.post('/actions/execute', async (req, res) => {
  try {
    const { tool, params, message } = req.body;
    
    // Validate tool exists
    if (!tools[tool]) {
      return res.status(400).json({
        error: "Tool not found",
        availableTools: Object.keys(tools)
      });
    }
    
    // Execute the tool
    const result = await tools[tool].handler(params || {});
    
    // Prepare response
    const response = {
      tool,
      description: tools[tool].description,
      originalMessage: message || "No message provided",
      result,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
    
  } catch (error) {
    console.error("Error:", error);
    const statusCode = error.message.includes("required") ? 400 : 500;
    res.status(statusCode).json({ 
      error: "Failed to process request",
      details: error.message 
    });
  }
});

// Endpoint to list available tools
app.get('/actions/tools', (req, res) => {
  const toolsList = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description
  }));
  
  res.json({
    tools: toolsList
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`- POST /actions/echo (with x-api-key header)`);
  console.log(`- POST /actions/execute (with x-api-key header)`);
  console.log(`- GET /actions/tools`);
  console.log(`- GET /health`);
});