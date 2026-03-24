const { Plugin, ItemView, Modal, Notice, MarkdownView, MarkdownRenderer, MarkdownRenderChild, setIcon } = require('obsidian');

const VIEW_TYPE = 'ai-sidebar';

const DEFAULT_SETTINGS = {
  baseUrl: "http://127.0.0.1:11434",
  localModel: "llama2",
  localEndpoint: "/v1/chat/completions",
  temperature: 0.7,
  max_tokens: 2048,
  autoCheckHealth: true,
  timeoutMs: 120000,
  showTokenCounter: true,
  shortcuts: {
    newConversation: 'Ctrl+Shift+N',
    saveConversation: 'Ctrl+Shift+S',
    settings: 'Ctrl+Shift+P',
    askSelection: 'Ctrl+Shift+A',
    editSelection: 'Ctrl+Shift+E'
  },
  conversationsFolder: "AI Conversations",
  currentMode: 'local',
  cloudApiType: 'openai',
  openaiApiKey: "",
  openaiModel: "gpt-3.5-turbo",
  openaiEndpoint: "https://api.openai.com/v1/chat/completions",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  geminiEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
  anthropicApiKey: "",
  anthropicModel: "claude-3-haiku-20240307",
  anthropicEndpoint: "https://api.anthropic.com/v1/messages",
  customApiKey: "",
  customModel: "",
  customEndpoint: "",
  customHeaders: "{}",
  customBodyTemplate: '{"messages": {{messages}}, "model": "{{model}}"}',
  inputPosition: "bottom"
};

// ==================== UTILITY FUNCTIONS ====================

function trimContent(text, maxChars = 4000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated automatically...]";
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ==================== CUSTOM ERROR CLASSES ====================

class NetworkError extends Error {
  constructor(statusCode, message, statusText) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class StreamingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StreamingError';
  }
}

class AuthenticationError extends Error {
  constructor(message, provider) {
    super(message);
    this.name = 'AuthenticationError';
    this.provider = provider;
  }
}

class RateLimitError extends Error {
  constructor(message, provider, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfter = retryAfter;
  }
}

// ==================== NETWORK MANAGER ====================

class NetworkManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.abortControllers = new Map();
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async fetchWithRetry(url, options, requestId = null) {
    const controller = new AbortController();
    if (requestId) {
      this.abortControllers.set(requestId, controller);
    }

    const timeoutMs = options.timeout || this.plugin.settings.timeoutMs || 120000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          cache: 'no-cache',
          credentials: 'omit',
          mode: 'cors'
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          if (response.status === 401 || response.status === 403) {
            throw new AuthenticationError(`Authentication failed: ${response.status}`, url);
          } else if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            throw new RateLimitError(`Rate limit exceeded`, url, parseInt(retryAfter));
          } else {
            throw new NetworkError(response.status, errorText, response.statusText);
          }
        }

        clearTimeout(timeoutId);
        if (requestId) {
          this.abortControllers.delete(requestId);
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          clearTimeout(timeoutId);
          throw new TimeoutError(`Request timeout after ${timeoutMs}ms`);
        }

        if (error instanceof AuthenticationError || error instanceof RateLimitError) {
          throw error;
        }

        if (this.shouldRetry(error, attempt)) {
          const delay = this.calculateBackoff(attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        break;
      }
    }

    clearTimeout(timeoutId);
    if (requestId) {
      this.abortControllers.delete(requestId);
    }

    throw this.normalizeError(lastError);
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries) return false;
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    
    if (error.name === 'NetworkError') {
      return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
    }
    
    return false;
  }

  calculateBackoff(attempt) {
    return Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 100, 30000);
  }

  normalizeError(error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return new NetworkError(0, 'Network connection failed. Please check your internet connection and ensure the AI service is running.', 'NETWORK_ERROR');
    }
    return error;
  }

  abortRequest(requestId) {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  abortAllRequests() {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }
}

// ==================== STREAMING HANDLER ====================

class StreamingHandler {
  constructor() {
    this.buffer = '';
    this.chunkProcessors = new Map();
    
    this.registerChunkProcessor('openai', this.processOpenAIChunk.bind(this));
    this.registerChunkProcessor('local', this.processLocalChunk.bind(this));
    this.registerChunkProcessor('anthropic', this.processAnthropicChunk.bind(this));
    this.registerChunkProcessor('gemini', this.processGeminiChunk.bind(this));
    this.registerChunkProcessor('generic', this.processGenericChunk.bind(this));
  }

  registerChunkProcessor(provider, processor) {
    this.chunkProcessors.set(provider, processor);
  }

  async handleStreamingResponse(response, onChunk, provider = 'local') {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const processor = this.chunkProcessors.get(provider) || this.processGenericChunk;
  
  let accumulatedText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        
        const text = processor(line);
        if (text && text.trim().length > 0) {
          accumulatedText += text;
          // Call onChunk immediately for each piece of actual content
          onChunk(text);
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const text = processor(buffer);
      if (text && text.trim().length > 0) {
        accumulatedText += text;
        onChunk(text);
      }
    }

    return accumulatedText;
  } catch (error) {
    console.error('Streaming error:', error);
    throw new StreamingError('Stream interrupted: ' + error.message);
  }
}

  processLocalChunk(line) {
  // Handle SSE format: data: {...}
  if (line.startsWith('data: ')) {
    const data = line.slice(6).trim();
    if (data === '[DONE]') return '';
    
    try {
      const parsed = JSON.parse(data);
      
      // Skip chunks with null content or empty content
      if (parsed.finish_reason === 'stop') return '';
      
      // Ollama format
      if (parsed.message?.content) {
        const content = parsed.message.content;
        // Only return if there's actual content
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      // OpenAI-compatible format with delta
      if (parsed.choices?.[0]?.delta?.content) {
        const content = parsed.choices[0].delta.content;
        // Only return if there's actual content
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      // Standard message format
      if (parsed.choices?.[0]?.message?.content) {
        const content = parsed.choices[0].message.content;
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      // Text format
      if (parsed.choices?.[0]?.text) {
        const content = parsed.choices[0].text;
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      // Simple response format
      if (parsed.response) {
        const content = parsed.response;
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      if (parsed.content) {
        const content = parsed.content;
        if (content && content.trim().length > 0) {
          return content;
        }
        return '';
      }
      
      // If we can't find content but have choices with delta, check if it has content
      if (parsed.choices?.[0]?.delta) {
        const delta = parsed.choices[0].delta;
        if (delta.content && delta.content.trim().length > 0) {
          return delta.content;
        }
        return '';
      }
      
    } catch (e) {
      // If parsing fails, return the raw data if it looks like actual text
      if (data.length > 0 && !data.startsWith('{') && !data.startsWith('[') && 
          data !== 'null' && data !== 'undefined') {
        return data;
      }
    }
    return '';
  }
  
  // Handle plain text streaming (some local servers)
  if (!line.startsWith('{') && !line.startsWith('[') && line.length > 0 &&
      line !== 'null' && line !== 'undefined') {
    return line;
  }
  
  // Try to parse as JSON even without data: prefix
  try {
    const parsed = JSON.parse(line);
    
    // Skip if it's just metadata
    if (parsed.finish_reason === 'stop') return '';
    
    if (parsed.message?.content) {
      const content = parsed.message.content;
      if (content && content.trim().length > 0) return content;
    }
    if (parsed.response) {
      const content = parsed.response;
      if (content && content.trim().length > 0) return content;
    }
    if (parsed.content) {
      const content = parsed.content;
      if (content && content.trim().length > 0) return content;
    }
    if (parsed.choices?.[0]?.delta?.content) {
      const content = parsed.choices[0].delta.content;
      if (content && content.trim().length > 0) return content;
    }
    if (parsed.choices?.[0]?.message?.content) {
      const content = parsed.choices[0].message.content;
      if (content && content.trim().length > 0) return content;
    }
    if (parsed.choices?.[0]?.text) {
      const content = parsed.choices[0].text;
      if (content && content.trim().length > 0) return content;
    }
  } catch {
    // Ignore parsing errors
  }
  
  return '';
}

  processOpenAIChunk(line) {
    if (!line.startsWith('data: ')) return '';
    const data = line.slice(6).trim();
    if (data === '[DONE]') return '';
    
    try {
      const parsed = JSON.parse(data);
      return parsed.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  }

  processAnthropicChunk(line) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text;
      }
    } catch {
      const match = line.match(/"text":"([^"]+)"/);
      return match ? match[1] : '';
    }
    return '';
  }

  processGeminiChunk(line) {
    try {
      const parsed = JSON.parse(line);
      return parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
      return '';
    }
  }

  processGenericChunk(line) {
    try {
      const parsed = JSON.parse(line);
      return parsed.content || 
             parsed.text || 
             parsed.response || 
             parsed.message?.content ||
             parsed.choices?.[0]?.text ||
             parsed.choices?.[0]?.delta?.content ||
             parsed.candidates?.[0]?.content?.parts?.[0]?.text ||
             '';
    } catch {
      return line.length > 0 && !line.startsWith('{') ? line : '';
    }
  }
}

// ==================== SESSION MANAGER ====================

class SessionManager {
  constructor(saved = []) {
    // Filter out any temporary sessions that might have come from storage
    this.sessions = (saved && saved.length) ? saved.filter(s => !s.isTemporary) : [];
    this.activeId = (this.sessions[0] && this.sessions[0].id) || null;
  }
  
  /**
   * Create a new regular session
   * @param {string} name - Session name (optional)
   * @param {string} sys - System prompt (optional)
   * @param {boolean} needsNaming - Whether this session needs auto-naming (default: false)
   * @returns {Object} The created session
   */
  create(name = null, sys = "", needsNaming = false) {
    this.deleteTemporary(); // Delete any existing temporary chat
    
    const id = Date.now().toString();
    const sessionName = name || this.generateDefaultName();
    
    const session = { 
      id, 
      name: sessionName, 
      systemPrompt: sys || "", 
      messages: [],
      isTemporary: false,
      needsNaming: needsNaming || (!name && this.sessions.length > 0), // Mark for auto-naming if no name provided and not the first session
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    this.sessions.push(session);
    this.activeId = id;
    return session;
  }
  
  /**
   * Create a new temporary session
   * @param {string} name - Session name (optional)
   * @returns {Object} The created temporary session
   */
  createTemporary(name = null) {
    this.deleteTemporary(); // Delete any existing temporary chat
    
    const id = Date.now().toString() + '_temp';
    const session = {
      id,
      name: name || 'Temporary Chat',
      systemPrompt: "",
      messages: [],
      isTemporary: true,
      needsNaming: false, // Temporary chats don't need naming
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    this.sessions.push(session);
    this.activeId = id;
    return session;
  }
  
  /**
   * Generate a default name for a new session
   * @returns {string} Default session name
   */
  generateDefaultName() {
    if (this.sessions.length === 0) {
      return 'Default Conversation';
    }
    
    // Count non-temporary sessions for numbering
    const regularSessions = this.sessions.filter(s => !s.isTemporary);
    return `Conversation ${regularSessions.length + 1}`;
  }
  
  /**
   * Delete any temporary session
   */
  deleteTemporary() {
    const tempSession = this.sessions.find(s => s.isTemporary);
    if (tempSession) {
      this.sessions = this.sessions.filter(s => !s.isTemporary);
      if (this.activeId === tempSession.id) {
        this.activeId = this.sessions.length ? this.sessions[0].id : null;
      }
    }
  }
  
  /**
   * Delete a session by ID
   * @param {string} id - Session ID to delete
   */
  delete(id) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.activeId === id) {
      this.activeId = (this.sessions[0] && this.sessions[0].id) || null;
    }
  }
  
  /**
   * Switch to a different session
   * @param {string} id - Session ID to switch to
   */
  switchTo(id) {
    const targetSession = this.sessions.find(s => s.id === id);
    if (targetSession) {
      // If current active session is temporary and different from target, delete the temporary
      const currentActive = this.getActive();
      if (currentActive && currentActive.isTemporary && currentActive.id !== id) {
        this.deleteTemporary(); // This will delete only the temporary, target still exists
      }
      this.activeId = id;
      
      // Reset the needsNaming flag when switching to a session
      // This prevents auto-naming from triggering on switch
      if (targetSession.needsNaming) {
        // Only keep needsNaming if the session is truly empty
        targetSession.needsNaming = targetSession.messages.length === 0;
      }
    }
  }
  
  /**
   * Get the active session
   * @returns {Object|null} Active session or null
   */
  getActive() { 
    return this.sessions.find(s => s.id === this.activeId) || null; 
  }
  
  /**
   * Get a session by ID
   * @param {string} id - Session ID
   * @returns {Object|null} Session or null
   */
  getSession(id) {
    return this.sessions.find(s => s.id === id) || null;
  }
  
  /**
   * Update session name
   * @param {string} id - Session ID
   * @param {string} newName - New session name
   * @returns {boolean} Success status
   */
  updateName(id, newName) {
    const session = this.sessions.find(s => s.id === id);
    if (session && newName && newName.trim()) {
      session.name = newName.trim();
      session.lastModified = Date.now();
      session.needsNaming = false; // Clear naming flag when manually named
      return true;
    }
    return false;
  }
  
  /**
   * Mark a session as named (clear needsNaming flag)
   * @param {string} id - Session ID
   */
  markAsNamed(id) {
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      session.needsNaming = false;
      session.lastModified = Date.now();
    }
  }
  
  /**
   * Check if a session needs auto-naming
   * @param {string} id - Session ID
   * @returns {boolean} Whether session needs naming
   */
  needsNaming(id) {
    const session = this.sessions.find(s => s.id === id);
    if (!session) return false;
    
    // Session needs naming if:
    // 1. It has the needsNaming flag set to true
    // 2. It has a default/generic name
    // 3. It has at least one message (so we have content to name from)
    // 4. It's not temporary
    return (
      !session.isTemporary &&
      session.messages.length > 0 &&
      (session.needsNaming || this.hasDefaultName(session.name))
    );
  }
  
  /**
   * Check if a name is a default/generic name
   * @param {string} name - Session name to check
   * @returns {boolean} Whether it's a default name
   */
  hasDefaultName(name) {
    const defaultPatterns = [
      /^Conversation \d+$/,
      /^Session \d+$/,
      /^New Conversation$/,
      /^Default Conversation$/,
      /^Temporary Chat$/
    ];
    
    return defaultPatterns.some(pattern => pattern.test(name));
  }
  
  /**
   * Get all sessions that need auto-naming
   * @returns {Array} Sessions that need naming
   */
  getSessionsNeedingNaming() {
    return this.sessions.filter(s => 
      !s.isTemporary && 
      s.messages.length > 0 && 
      (s.needsNaming || this.hasDefaultName(s.name))
    );
  }
  
  /**
   * Add a message to the active session
   * @param {string} role - Message role ('user' or 'assistant')
   * @param {string} content - Message content
   * @param {Array} attachments - File attachments (optional)
   */
  addMessage(role, content, attachments = []) {
    const s = this.getActive();
    if (!s) return;
    
    s.messages.push({ 
      role, 
      content,
      attachments: attachments || [],
      timestamp: Date.now()
    });
    
    s.lastModified = Date.now();
  }
  
  /**
   * Get messages formatted for API request
   * @param {number} maxMessages - Maximum number of recent messages to include
   * @returns {Array} Formatted messages
   */
  getMessagesForRequest(maxMessages = 10) {
    const s = this.getActive();
    if (!s) return [];
    
    const out = [];
    
    // Add system prompt if exists
    if (s.systemPrompt && s.systemPrompt.trim()) {
      out.push({ 
        role: "system", 
        content: s.systemPrompt 
      });
    }
    
    // Get recent messages
    const recent = s.messages.slice(-maxMessages);
    
    // Format messages with attachments
    const formattedMessages = recent.map(msg => {
      let fullContent = msg.content;
      
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(attachment => {
          fullContent += `\n\n[File content: ${attachment.name}]\n${attachment.content}`;
        });
      }
      
      return {
        role: msg.role,
        content: fullContent
      };
    });
    
    return out.concat(formattedMessages);
  }
  
  /**
   * Clear all messages in the active session
   */
  clearActiveSession() {
    const s = this.getActive();
    if (s) {
      s.messages = [];
      s.lastModified = Date.now();
    }
  }
  
  /**
   * Get session statistics
   * @param {string} id - Session ID (optional, uses active if not provided)
   * @returns {Object} Session statistics
   */
  getStats(id = null) {
    const session = id ? this.getSession(id) : this.getActive();
    if (!session) return null;
    
    const userMessages = session.messages.filter(m => m.role === 'user').length;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant').length;
    const totalAttachments = session.messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0);
    
    return {
      name: session.name,
      totalMessages: session.messages.length,
      userMessages,
      assistantMessages,
      totalAttachments,
      createdAt: session.createdAt,
      lastModified: session.lastModified,
      needsNaming: this.needsNaming(session.id),
      isTemporary: session.isTemporary
    };
  }
  
  /**
   * Export a session to Markdown format
   * @param {Object} session - Session to export
   * @returns {string} Markdown content
   */
  exportToMarkdown(session) {
    let content = `---\n`;
    content += `The Topic: ${session.name}\n`;
    content += `tags:\n  - Type/Ai-Conversations\n`;
    content += `---\n\n`;
    
    content += `# ${session.name}\n\n`;
    
    if (session.systemPrompt) {
      content += `## System Prompt\n\`\`\`\n${session.systemPrompt}\n\`\`\`\n\n`;
    }

    session.messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
      
      content += `### ${role} (${index + 1})`;
      content += `\n\n`;
      
      if (msg.attachments && msg.attachments.length > 0) {
        content += `#### Attachments:\n`;
        msg.attachments.forEach(attachment => {
          content += `- [[${attachment.name}]]\n`;
        });
        content += `\n`;
      }
      
      content += `${msg.content}\n\n`;
      
      if (index < session.messages.length - 1) {
        content += `---\n\n`;
      }
    });
    
    return content;
  }
  
  /**
   * Get all sessions with optional filtering
   * @param {Object} filters - Optional filters
   * @returns {Array} Filtered sessions
   */
  getAllSessions(filters = {}) {
    let result = [...this.sessions];
    
    if (filters.excludeTemporary) {
      result = result.filter(s => !s.isTemporary);
    }
    
    if (filters.onlyTemporary) {
      result = result.filter(s => s.isTemporary);
    }
    
    if (filters.needsNaming) {
      result = result.filter(s => this.needsNaming(s.id));
    }
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.messages.some(m => m.content.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort by last modified (newest first)
    result.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    
    return result;
  }
  
  /**
   * Get session count
   * @param {boolean} excludeTemporary - Whether to exclude temporary sessions
   * @returns {number} Session count
   */
  getSessionCount(excludeTemporary = true) {
    if (excludeTemporary) {
      return this.sessions.filter(s => !s.isTemporary).length;
    }
    return this.sessions.length;
  }
  
  /**
   * Duplicate a session
   * @param {string} id - Session ID to duplicate
   * @param {string} newName - Name for the duplicated session (optional)
   * @returns {Object|null} New session or null
   */
  duplicate(id, newName = null) {
    const original = this.getSession(id);
    if (!original) return null;
    
    const newId = Date.now().toString();
    const duplicate = {
      ...original,
      id: newId,
      name: newName || `${original.name} (Copy)`,
      messages: [...original.messages], // Shallow copy is fine since messages are objects
      createdAt: Date.now(),
      lastModified: Date.now(),
      isTemporary: false,
      needsNaming: false
    };
    
    this.sessions.push(duplicate);
    return duplicate;
  }
  
  /**
   * Merge two sessions
   * @param {string} targetId - Target session ID
   * @param {string} sourceId - Source session ID to merge from
   * @returns {boolean} Success status
   */
  merge(targetId, sourceId) {
    const target = this.getSession(targetId);
    const source = this.getSession(sourceId);
    
    if (!target || !source || target.isTemporary || source.isTemporary) {
      return false;
    }
    
    // Add all messages from source to target
    target.messages.push(...source.messages);
    
    // Sort by timestamp if available
    target.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    target.lastModified = Date.now();
    
    // Delete the source session
    this.delete(sourceId);
    
    return true;
  }
}

// ==================== BASE AI PROVIDER ====================

class BaseAIProvider {
  constructor(plugin, providerName) {
    this.plugin = plugin;
    this.name = providerName;
    this.networkManager = new NetworkManager(plugin);
    this.streamingHandler = new StreamingHandler();
  }

  supportsStreaming() {
    return true;
  }

  async send(payload, opts = {}) {
    const requestId = this.generateRequestId();
    
    try {
      const url = this.buildUrl(payload);
      const headers = this.buildHeaders();
      const body = this.buildBody(payload);
      
      if (payload.stream && this.supportsStreaming()) {
        return await this.sendStreamingRequest(url, headers, body, opts, requestId);
      } else {
        return await this.sendNormalRequest(url, headers, body, opts, requestId);
      }
    } catch (error) {
      return this.handleError(error);
    } finally {
      if (requestId) {
        this.networkManager.abortRequest(requestId);
      }
    }
  }

  async sendStreamingRequest(url, headers, body, opts, requestId) {
    const response = await this.networkManager.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body,
      timeout: opts.timeoutMs
    }, requestId);

    if (!response.body) {
      throw new Error('Response body is not readable');
    }

    const accumulatedText = await this.streamingHandler.handleStreamingResponse(
      response,
      (chunk) => {
        if (opts.onChunk) {
          opts.onChunk(chunk);
        }
      },
      this.getStreamingFormat()
    );

    return { final: accumulatedText };
  }

  async sendNormalRequest(url, headers, body, opts, requestId) {
    const response = await this.networkManager.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body,
      timeout: opts.timeoutMs
    }, requestId);

    const data = await response.json();
    return this.parseResponse(data);
  }

  generateRequestId() {
    return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleError(error) {
    console.error(`${this.name} error:`, error);
    
    if (error instanceof AuthenticationError) {
      throw new Error(`🔐 ${this.name} authentication failed. Please check your API key in settings.`);
    }
    
    if (error instanceof RateLimitError) {
      throw new Error(`⏳ ${this.name} rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`);
    }
    
    if (error instanceof NetworkError) {
      if (error.statusCode === 0) {
        throw new Error(`🌐 Cannot connect to ${this.name}. Please check if the service is running and accessible.`);
      }
      if (error.statusCode === 404) {
        throw new Error(`🔍 ${this.name} endpoint not found. Please check your URL configuration.`);
      }
      throw new Error(`🌐 ${this.name} network error (${error.statusCode}): ${error.message}`);
    }
    
    if (error instanceof TimeoutError) {
      throw new Error(`⏱️ ${this.name} request timed out. The service might be slow or unresponsive.`);
    }
    
    if (error instanceof StreamingError) {
      throw new Error(`📡 Streaming error with ${this.name}: ${error.message}`);
    }
    
    throw new Error(`${this.name} error: ${error.message}`);
  }

  buildUrl(payload) { throw new Error('Not implemented'); }
  buildHeaders() { throw new Error('Not implemented'); }
  buildBody(payload) { throw new Error('Not implemented'); }
  parseResponse(data) { throw new Error('Not implemented'); }
  getStreamingFormat() { return 'generic'; }
}

// ==================== LOCAL AI PROVIDER ====================

class LocalAIProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'LocalAI');
  }

  buildUrl(payload) {
    const base = this.plugin.settings.baseUrl.replace(/\/$/, "");
    const endpoint = this.plugin.settings.localEndpoint || '/v1/chat/completions';
    return base + endpoint;
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*'
    };
  }

  buildBody(payload) {
    const body = {
      model: this.plugin.settings.localModel,
      messages: payload.messages,
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens,
      stream: payload.stream || false
    };

    return JSON.stringify(body);
  }

  parseResponse(data) {
    if (data.choices && data.choices[0]) {
      if (data.choices[0].message) {
        return { final: data.choices[0].message.content };
      }
      if (data.choices[0].text) {
        return { final: data.choices[0].text };
      }
    }
    
    if (data.message) {
      return { final: data.message.content };
    }
    
    if (data.response) {
      return { final: data.response };
    }
    
    return { final: JSON.stringify(data) };
  }

  getStreamingFormat() {
    return 'local';
  }

  async checkHealth() {
    try {
      const base = this.plugin.settings.baseUrl.replace(/\/$/, "");
      
      const endpoints = ['/health', '/api/health', '/v1/health', '/'];
      
      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(base + endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            try {
              const data = await response.json();
              if (data && (data.status === 'ok' || data.status === 'healthy' || data.ready === true)) {
                return { ok: true, message: '✓ Service is healthy' };
              }
            } catch {
              return { ok: true, message: '✓ Service is reachable' };
            }
          }
        } catch {
          continue;
        }
      }
      
      try {
        const testResponse = await this.send({
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5,
          stream: false
        }, { timeoutMs: 5000 });
        
        if (testResponse && testResponse.final) {
          return { ok: true, message: '✓ Service is responding' };
        }
      } catch {
        // Ignore
      }
      
      return { ok: false, message: '⨉ Local AI service is not reachable' };
    } catch (error) {
      return { ok: false, message: `⨉ ${error.message}` };
    }
  }
}

// ==================== OPENAI PROVIDER ====================

class OpenAIProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'OpenAI');
  }

  buildUrl(payload) {
    return this.plugin.settings.openaiEndpoint || "https://api.openai.com/v1/chat/completions";
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}`
    };
  }

  buildBody(payload) {
    const body = {
      model: this.plugin.settings.openaiModel || "gpt-3.5-turbo",
      messages: payload.messages,
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens
    };

    if (payload.stream) {
      body.stream = true;
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { final: data.choices[0].message.content };
    }
    return { final: JSON.stringify(data) };
  }

  getStreamingFormat() {
    return 'openai';
  }

  async checkHealth() {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { 'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}` },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to OpenAI' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== GEMINI PROVIDER (NON-STREAMING) ====================

class GeminiProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Gemini');
    this.lastRequestTime = 0;
    this.minDelay = 2000;
  }

  supportsStreaming() {
    return false;
  }

  async send(payload, opts) {
    await this.throttleRequests();
    return super.send(payload, opts);
  }

  buildUrl(payload) {
    const modelName = this.plugin.settings.geminiModel || "gemini-1.5-flash";
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.plugin.settings.geminiApiKey}`;
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json'
    };
  }

  buildBody(payload) {
    const contents = this.convertToGeminiFormat(payload.messages);
    
    return JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: payload.temperature || this.plugin.settings.temperature,
        maxOutputTokens: payload.max_tokens || this.plugin.settings.max_tokens,
        topP: 0.8,
        topK: 40
      }
    });
  }

  parseResponse(data) {
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return { final: data.candidates[0].content.parts[0].text };
    }
    return { final: JSON.stringify(data) };
  }

  async throttleRequests() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelay) {
      const delay = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  convertToGeminiFormat(messages) {
    const contents = [];
    let systemPrompt = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else if (msg.role === 'user') {
        const content = systemPrompt ? `[System: ${systemPrompt}]\n\n${msg.content}` : msg.content;
        contents.push({
          role: 'user',
          parts: [{ text: content }]
        });
        systemPrompt = '';
      } else if (msg.role === 'assistant') {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    
    return contents;
  }

  async checkHealth() {
    try {
      const modelName = this.plugin.settings.geminiModel || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}?key=${this.plugin.settings.geminiApiKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 403 || response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      if (response.status === 429) {
        return { ok: false, message: '⏳ Rate limit exceeded. Please wait.' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to Gemini' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== ANTHROPIC PROVIDER ====================

class AnthropicProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Anthropic');
  }

  buildUrl(payload) {
    return this.plugin.settings.anthropicEndpoint || "https://api.anthropic.com/v1/messages";
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.plugin.settings.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    };
  }

  buildBody(payload) {
    const body = {
      model: this.plugin.settings.anthropicModel || "claude-3-haiku-20240307",
      messages: payload.messages.filter(m => m.role !== 'system'),
      temperature: payload.temperature || this.plugin.settings.temperature,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens
    };

    const systemMessage = payload.messages.find(m => m.role === 'system');
    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (payload.stream) {
      body.stream = true;
    }

    return JSON.stringify(body);
  }

  parseResponse(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      return { final: data.content[0].text };
    }
    return { final: JSON.stringify(data) };
  }

  getStreamingFormat() {
    return 'anthropic';
  }

  async checkHealth() {
    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        method: 'GET',
        headers: { 'x-api-key': this.plugin.settings.anthropicApiKey },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.status === 401) {
        return { ok: false, message: '⨉ Invalid API key' };
      }
      
      return { ok: response.ok, message: response.ok ? '✓ Connected to Anthropic' : `⨉ Error ${response.status}` };
    } catch (e) {
      return { ok: false, message: `⨉ ${e.message}` };
    }
  }
}

// ==================== CUSTOM PROVIDER ====================

class CustomProvider extends BaseAIProvider {
  constructor(plugin) {
    super(plugin, 'Custom API');
  }

  buildUrl(payload) {
    return this.plugin.settings.customEndpoint;
  }

  buildHeaders() {
    let headers = { 'Content-Type': 'application/json' };
    
    try {
      const customHeaders = JSON.parse(this.plugin.settings.customHeaders || '{}');
      headers = { ...headers, ...customHeaders };
    } catch (e) {
      if (this.plugin.settings.customApiKey) {
        headers['Authorization'] = `Bearer ${this.plugin.settings.customApiKey}`;
      }
    }
    
    return headers;
  }

  buildBody(payload) {
    let bodyData = {
      model: this.plugin.settings.customModel,
      messages: payload.messages,
      temperature: payload.temperature || this.plugin.settings.temperature || 0.7,
      max_tokens: payload.max_tokens || this.plugin.settings.max_tokens || 2048
    };

    try {
      if (this.plugin.settings.customBodyTemplate && this.plugin.settings.customBodyTemplate.includes('{{')) {
        let bodyStr = this.plugin.settings.customBodyTemplate
          .replace('{{model}}', JSON.stringify(this.plugin.settings.customModel))
          .replace('{{messages}}', JSON.stringify(payload.messages))
          .replace('{{temperature}}', (payload.temperature || this.plugin.settings.temperature || 0.7).toString())
          .replace('{{max_tokens}}', (payload.max_tokens || this.plugin.settings.max_tokens || 2048).toString());
        bodyData = JSON.parse(bodyStr);
      }
    } catch (e) {
      console.log("Using default body template");
    }

    return JSON.stringify(bodyData);
  }

  parseResponse(data) {
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { final: data.choices[0].message.content };
    } else if (data.choices && data.choices[0] && data.choices[0].text) {
      return { final: data.choices[0].text };
    } else if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return { final: data.candidates[0].content.parts[0].text };
    } else if (data.message && data.message.content) {
      return { final: data.message.content };
    } else if (data.result) {
      return { final: data.result };
    } else if (data.content) {
      return { final: data.content };
    } else {
      return { final: JSON.stringify(data) };
    }
  }

  getStreamingFormat() {
    return 'generic';
  }

  async checkHealth() {
    try {
      const testResponse = await this.send({
        messages: [{ role: "user", content: "Say 'OK' in one word" }],
        temperature: 0.7,
        max_tokens: 10
      }, { timeoutMs: 15000 });
      
      return { 
        ok: true, 
        message: `✓ Connection successful. Response: "${testResponse.final.substring(0, 50)}..."` 
      };
    } catch (error) {
      return { 
        ok: false, 
        message: `⨉ ${error.message}` 
      };
    }
  }
}

// ==================== API MANAGER ====================

class APIManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.providers = {
      openai: new OpenAIProvider(plugin),
      gemini: new GeminiProvider(plugin),
      anthropic: new AnthropicProvider(plugin),
      custom: new CustomProvider(plugin),
      local: new LocalAIProvider(plugin)
    };
  }
  
  async sendMessage(payload, opts = {}) {
  const mode = this.plugin.settings.currentMode;
  const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
  
  const provider = this.providers[apiType];
  if (!provider) {
    throw new Error(`Unknown API provider: ${apiType}`);
  }
  
  // Ensure stream is set to true in the payload if we want streaming
  if (opts.onChunk) {
    payload.stream = true;
  }
  
  return await provider.send(payload, opts);
}
  
  async checkHealth() {
    const mode = this.plugin.settings.currentMode;
    const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
    
    const provider = this.providers[apiType];
    return provider ? await provider.checkHealth() : { ok: false, message: 'No provider selected' };
  }

  getCurrentProviderName() {
    const mode = this.plugin.settings.currentMode;
    if (mode === 'local') return 'Local AI';
    
    const names = {
      openai: 'OpenAI',
      gemini: 'Gemini',
      anthropic: 'Claude',
      custom: 'Custom API'
    };
    return names[this.plugin.settings.cloudApiType] || 'Cloud AI';
  }

  getCurrentProviderIcon() {
    if (this.plugin.settings.currentMode === 'local') return 'monitor-speaker';
    return 'server';
  }
}

// ==================== PROMPT MODAL ====================

class PromptModal extends Modal {
  constructor(app, title = "Prompt", initial = "", onSubmit) {
    super(app);
    this.title = title;
    this.initial = initial;
    this.onSubmit = onSubmit;
  }
  
  async onOpen() {  // <-- هذا خطأ، هذه دالة PromptModal وليست ChatView
  this.containerEl.empty();
  this.containerEl.addClass('ai-sidebar');
  this.containerEl.style.direction = 'ltr';
  this.containerEl.style.textAlign = 'left';
  this.containerEl.style.display = 'flex';
  this.containerEl.style.flexDirection = 'column';
  this.containerEl.style.height = '100%';
  this.containerEl.style.padding = '8px';
  this.containerEl.style.gap = '8px';
  this.containerEl.style.boxSizing = 'border-box';

  const topBar = this.containerEl.createDiv({ cls: 'ai-top-bar' });
  topBar.style.display = 'flex';
  topBar.style.justifyContent = 'flex-start';
  topBar.style.alignItems = 'center';
  topBar.style.height = '36px';
  topBar.style.width = '100%';
  topBar.style.gap = '8px';

  this.shortcutsBtn = topBar.createEl('button', {
    cls: 'ai-shortcuts-btn'
  });
  setIcon(this.shortcutsBtn, 'command');
  this.styleButton(this.shortcutsBtn);
  this.shortcutsBtn.title = 'Shortcuts';

  this.modeToggleBtn = topBar.createEl('button', {
    cls: 'ai-mode-toggle'
  });
  setIcon(this.modeToggleBtn, this.getProviderIcon());
  this.styleButton(this.modeToggleBtn);
  this.modeToggleBtn.title = this.getProviderInfo();

  // زر المحادثة المؤقتة
  this.tempChatBtn = topBar.createEl('button', {
    cls: 'ai-temp-chat-btn'
  });
  setIcon(this.tempChatBtn, 'message-square-dashed');
  this.styleButton(this.tempChatBtn);
  this.tempChatBtn.title = 'New Temporary Chat (unsaved)';

  this.tokenCounter = topBar.createDiv({ 
    cls: 'ai-token-counter'
  });
  this.tokenCounter.style.fontSize = '11px';
  this.tokenCounter.style.padding = '4px 8px';
  this.tokenCounter.style.borderRadius = '12px';
  this.tokenCounter.style.background = 'transparent';
  this.tokenCounter.style.color = 'var(--text-muted)';
  this.tokenCounter.style.border = '1px solid var(--background-modifier-border)';
  this.tokenCounter.style.display = 'flex';
  this.tokenCounter.style.alignItems = 'center';
  this.tokenCounter.style.justifyContent = 'center';
  this.tokenCounter.style.gap = '4px';
  this.tokenCounter.style.minWidth = '70px';
  this.tokenCounter.style.height = '24px';
  
  const tokenIcon = this.tokenCounter.createSpan();
  setIcon(tokenIcon, 'binary');
  tokenIcon.style.display = 'flex';
  
  const tokenText = this.tokenCounter.createSpan();
  tokenText.textContent = '0/8192';
  
  this.updateTokenCounterVisibility();

  const spacer = topBar.createDiv({ cls: 'ai-top-spacer' });
  spacer.style.flex = '1';

  this.settingsBtn = topBar.createEl('button', { 
    cls: 'ai-settings-btn'
  });
  setIcon(this.settingsBtn, 'settings');
  this.styleButton(this.settingsBtn);
  this.settingsBtn.title = 'Settings';

  // الأحداث
  this.modeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.toggleAIMode();
  });

  this.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const settingsModal = new SettingsModal(this.app, this.plugin);
    settingsModal.open();
  });

  this.shortcutsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.showShortcutsMenu();
  });

  this.tempChatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    this.createTemporaryChat();
  });

  // التحقق من موقع الإدخال المفضل
  const inputPosition = this.plugin.settings.inputPosition || 'bottom';
  
  if (inputPosition === 'bottom') {
    // الترتيب الافتراضي: المحادثة في الأعلى، الإدخال في الأسفل
    await this.createChatArea();
    await this.createInputArea();
  } else {
    // الترتيب المعكوس: الإدخال في الأعلى، المحادثة في الأسفل
    await this.createInputArea();
    await this.createChatArea();
  }

  this._renderMessages();
  this._streaming = true;
  
  if (this.plugin.settings.showTokenCounter) {
    this.inputEl.addEventListener('input', () => this._updateTokenCounter());   
    setTimeout(() => this._updateTokenCounter(), 100);
  }
}

// دالة جديدة لإنشاء منطقة المحادثة
async createChatArea() {
  this.chatEl = this.containerEl.createDiv({ cls: 'ai-chat' });
  this.chatEl.style.flex = '1';
  this.chatEl.style.overflowY = 'auto';
  this.chatEl.style.padding = '16px';
  this.chatEl.style.borderRadius = '8px';
  this.chatEl.style.background = 'var(--background-primary)';
  this.chatEl.style.border = '1px solid var(--background-modifier-border)';
  this.chatEl.style.margin = '4px 0';
  this.chatEl.style.display = 'flex';
  this.chatEl.style.flexDirection = 'column';
}

// دالة جديدة لإنشاء منطقة الإدخال
async createInputArea() {
  const inputWrap = this.containerEl.createDiv({ cls: 'ai-input-wrap' });
  inputWrap.style.position = 'relative';
  inputWrap.style.width = '100%';
  inputWrap.style.marginTop = 'auto';
  inputWrap.style.paddingTop = '8px';
  inputWrap.style.borderTop = '1px solid var(--background-modifier-border)';
  
  this.inputEl = inputWrap.createEl('textarea', { 
    cls: 'ai-input',
    attr: { 
      placeholder: 'Type a message... (Shift+Enter send)',
      rows: '2'
    }
  });
  this.inputEl.style.width = '100%';
  this.inputEl.style.resize = 'vertical';
  this.inputEl.style.padding = '12px';
  this.inputEl.style.paddingBottom = '60px';
  this.inputEl.style.borderRadius = '8px';
  this.inputEl.style.border = '1px solid var(--background-modifier-border)';
  this.inputEl.style.background = 'var(--background-secondary)';
  this.inputEl.style.color = 'var(--text-normal)';
  this.inputEl.style.fontSize = '15px';
  this.inputEl.style.minHeight = '120px';
  this.inputEl.style.maxHeight = '300px';
  this.inputEl.style.lineHeight = '1.5';

  this.attachBtn = inputWrap.createEl('button', { 
    text: '+', 
    cls: 'ai-attach-btn floating-btn'
  });
  this.styleFloatingButton(this.attachBtn);
  this.attachBtn.style.bottom = '60px';
  this.attachBtn.title = 'Attach files';

  this.sendBtn = inputWrap.createEl('button', { 
    text: '➤', 
    cls: 'ai-send-btn floating-btn' 
  });
  this.styleFloatingButton(this.sendBtn);
  this.sendBtn.style.bottom = '15px';
  this.sendBtn.title = 'Send';

  this.sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    this._onSend();
  });
  
  this.attachBtn.addEventListener('click', (e) => {
    e.preventDefault();
    this._onAttach();
  });
  
  this.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      this._onSend();
    }
    // Enter alone creates a new line (default)
  });
}
  
  onClose() { 
    this.contentEl.empty(); 
  }
}

// ==================== ATTACH MODAL ====================

class AttachModal extends Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.selected = new Set();
    this.searchTerm = '';
    this.selectedFiles = [];
  }
  
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    const title = contentEl.createEl('h2', { 
      text: '📎 Attach Files',
      cls: 'ai-attach-title'
    });
    title.style.textAlign = 'center';
    title.style.margin = '0 0 20px 0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    
    const searchRow = contentEl.createDiv({ cls: 'ai-search-row' });
    const searchInput = searchRow.createEl('input', {
      type: 'text',
      placeholder: '🔍 Search files...'
    });
    searchInput.style.width = '100%';
    searchInput.style.padding = '10px 14px';
    searchInput.style.borderRadius = '8px';
    searchInput.style.border = '1px solid var(--background-modifier-border)';
    searchInput.style.backgroundColor = 'var(--background-secondary)';
    searchInput.style.color = 'var(--text-normal)';
    searchInput.style.fontSize = '14px';
    searchInput.style.marginBottom = '16px';
    
    const container = contentEl.createDiv({ cls: 'ai-file-list-container' });
    container.style.maxHeight = '300px';
    container.style.overflowY = 'auto';
    container.style.border = '1px solid var(--background-modifier-border)';
    container.style.borderRadius = '8px';
    container.style.padding = '8px';
    container.style.backgroundColor = 'var(--background-secondary)';
    container.style.marginBottom = '16px';
    
    const buttonRow = contentEl.createDiv({ cls: 'ai-attach-btn-row' });
    buttonRow.style.display = 'flex';
    buttonRow.style.justifyContent = 'center';
    buttonRow.style.gap = '12px';
    buttonRow.style.marginTop = '20px';
    
    const sendSel = buttonRow.createEl('button', { 
      text: '📎 Attach Selected',
      cls: 'ai-attach-send-btn'
    });
    sendSel.style.padding = '10px 24px';
    sendSel.style.borderRadius = '8px';
    sendSel.style.border = 'none';
    sendSel.style.backgroundColor = 'var(--interactive-accent)';
    sendSel.style.color = 'var(--text-on-accent)';
    sendSel.style.cursor = 'pointer';
    sendSel.style.fontSize = '14px';
    sendSel.style.fontWeight = '600';
    sendSel.style.minWidth = '140px';
    
    const cancel = buttonRow.createEl('button', { 
      text: 'Cancel',
      cls: 'ai-attach-cancel-btn'
    });
    cancel.style.padding = '10px 24px';
    cancel.style.borderRadius = '8px';
    cancel.style.border = '1px solid var(--background-modifier-border)';
    cancel.style.backgroundColor = 'transparent';
    cancel.style.color = 'var(--text-normal)';
    cancel.style.cursor = 'pointer';
    cancel.style.fontSize = '14px';
    cancel.style.minWidth = '140px';
    
    sendSel.addEventListener('click', async () => {
      const files = this.app.vault.getMarkdownFiles();
      const picked = files.filter(f => this.selected.has(f.path));
      if (picked.length === 0) {
        new Notice('No files selected');
        return;
      }
      
      this.selectedFiles = picked;
      this.onSubmit('files', picked);
      this.close();
    });
    
    cancel.addEventListener('click', () => this.close());
    
    const renderFiles = () => {
      container.empty();
      const files = this.app.vault.getMarkdownFiles();
      let filteredFiles = files;
      
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        filteredFiles = files.filter(f => 
          f.path.toLowerCase().includes(term) ||
          f.basename.toLowerCase().includes(term)
        );
      }
      
      if (filteredFiles.length === 0) {
        const emptyMsg = container.createDiv({ 
          cls: 'ai-empty-files',
          text: this.searchTerm.trim() ? 
            'No files match your search' : 
            'No markdown files found'
        });
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.padding = '40px 20px';
        emptyMsg.style.color = 'var(--text-muted)';
        emptyMsg.style.fontSize = '14px';
        return;
      }
      
      filteredFiles.forEach((f) => {
        const row = container.createDiv({ cls: 'ai-file-row' });
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.padding = '10px 12px';
        row.style.borderRadius = '6px';
        row.style.marginBottom = '6px';
        row.style.backgroundColor = 'var(--background-primary)';
        row.style.border = '1px solid var(--background-modifier-border)';
        row.style.cursor = 'pointer';
        
        const checkboxContainer = row.createDiv({ cls: 'ai-checkbox-container' });
        checkboxContainer.style.marginLeft = '12px';
        checkboxContainer.style.flexShrink = '0';
        
        const cb = checkboxContainer.createEl('input', { 
          type: 'checkbox',
          cls: 'ai-file-checkbox'
        });
        cb.style.width = '18px';
        cb.style.height = '18px';
        cb.style.cursor = 'pointer';
        cb.checked = this.selected.has(f.path);
        
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          if (e.target.checked) {
            this.selected.add(f.path);
          } else {
            this.selected.delete(f.path);
          }
        });
        
        const fileInfo = row.createDiv({ cls: 'ai-file-info' });
        fileInfo.style.flex = '1';
        fileInfo.style.minWidth = '0';
        
        const fileName = fileInfo.createEl('div', { 
          text: f.basename,
          cls: 'ai-file-name'
        });
        fileName.style.fontWeight = '600';
        fileName.style.fontSize = '14px';
        fileName.style.color = 'var(--text-normal)';
        fileName.style.marginBottom = '2px';
        fileName.style.whiteSpace = 'nowrap';
        fileName.style.overflow = 'hidden';
        fileName.style.textOverflow = 'ellipsis';
        
        const filePath = fileInfo.createEl('div', { 
          text: f.path,
          cls: 'ai-file-path'
        });
        filePath.style.fontSize = '12px';
        filePath.style.color = 'var(--text-muted)';
        filePath.style.whiteSpace = 'nowrap';
        filePath.style.overflow = 'hidden';
        filePath.style.textOverflow = 'ellipsis';
        
        row.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            cb.checked = !cb.checked;
            const event = new Event('change', { bubbles: true });
            cb.dispatchEvent(event);
          }
        });
      });
    };
    
    searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      renderFiles();
    });
    
    renderFiles();
  }
  
  onClose() { 
    this.contentEl.empty(); 
  }
}

// ==================== IN-NOTE AI INTERACTIONS ====================

class InNoteAIInteractions {
  constructor(plugin) {
    this.plugin = plugin;
    this.floatingMenu = null;
    this.registerContextMenu();
    this.registerFloatingMenu();
    this.registerKeyboardShortcuts();
  }

  registerContextMenu() {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-menu', (menu, editor, view) => {
        const selection = editor.getSelection();
        
        if (selection && selection.trim().length > 0) {
          menu.addSeparator();
          
          menu.addItem((item) => {
            item.setTitle('🤖 AI: Ask about selection')
                .setIcon('brain')
                .onClick(() => this.askAboutSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('✏️ AI: Edit/Improve selection')
                .setIcon('pencil')
                .onClick(() => this.editSelection(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('📝 AI: Continue writing')
                .setIcon('quote')
                .onClick(() => this.continueWriting(editor, selection));
          });

          menu.addItem((item) => {
            item.setTitle('🌐 AI: Translate selection')
                .setIcon('languages')
                .onClick(() => this.translateSelection(editor, selection));
          });

          const submenu = menu.addItem((item) => {
            item.setTitle('🤖 AI: More options...')
                .setIcon('chevron-down');
          });

          submenu.setSubmenu((submenu) => {
            this.addMoreAIOptions(submenu, editor, selection);
          });
        }
      })
    );
  }

  registerFloatingMenu() {
    let timeoutId = null;
    
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('editor-change', (editor) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
          const selection = editor.getSelection();
          if (selection && selection.trim().length > 20) {
            this.showFloatingMenu(editor);
          } else {
            this.hideFloatingMenu();
          }
        }, 500);
      })
    );

    this.plugin.registerEvent(
      this.plugin.app.workspace.on('click', () => {
        this.hideFloatingMenu();
      })
    );
  }

  showFloatingMenu(editor) {
    this.hideFloatingMenu();

    const cursor = editor.getCursor('from');
    const coords = editor.charCoords(cursor, 'screen');
    
    const menu = document.createElement('div');
    menu.className = 'ai-floating-menu';
    menu.style.position = 'fixed';
    menu.style.top = (coords.top - 50) + 'px';
    menu.style.left = coords.left + 'px';
    menu.style.zIndex = '1000';
    menu.style.display = 'flex';
    menu.style.gap = '8px';
    menu.style.padding = '8px';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '30px';
    menu.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    menu.style.backdropFilter = 'blur(10px)';
    menu.style.animation = 'ai-float-in 0.2s ease';
    
    const buttons = [
      { icon: '🤖', title: 'Ask AI', action: () => this.askAboutSelection(editor, editor.getSelection()) },
      { icon: '✏️', title: 'Edit', action: () => this.editSelection(editor, editor.getSelection()) },
      { icon: '📝', title: 'Continue', action: () => this.continueWriting(editor, editor.getSelection()) },
      { icon: '🌐', title: 'Translate', action: () => this.translateSelection(editor, editor.getSelection()) }
    ];

    buttons.forEach(btn => {
      const button = menu.createEl('button', {
        text: btn.icon,
        cls: 'ai-floating-btn',
        attr: { title: btn.title }
      });
      button.style.width = '36px';
      button.style.height = '36px';
      button.style.borderRadius = '50%';
      button.style.border = 'none';
      button.style.background = 'var(--interactive-accent)';
      button.style.color = 'var(--text-on-accent)';
      button.style.fontSize = '18px';
      button.style.cursor = 'pointer';
      button.style.transition = 'all 0.2s ease';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.background = 'var(--interactive-accent-hover)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.background = 'var(--interactive-accent)';
      });
      
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.action();
        menu.remove();
      });
    });

    document.body.appendChild(menu);
    this.floatingMenu = menu;

    setTimeout(() => {
      const closeHandler = (e) => {
        if (menu && !menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  hideFloatingMenu() {
    if (this.floatingMenu) {
      this.floatingMenu.remove();
      this.floatingMenu = null;
    }
  }

  registerKeyboardShortcuts() {
    this.plugin.addCommand({
      id: 'ai-ask-selection',
      name: 'Ask AI about selected text',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'A' }],
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.askAboutSelection(editor, selection);
        } else {
          new Notice('Please select some text first');
        }
      }
    });

    this.plugin.addCommand({
      id: 'ai-edit-selection',
      name: 'Edit selected text with AI',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'E' }],
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection && selection.trim().length > 0) {
          this.editSelection(editor, selection);
        } else {
          new Notice('Please select some text first');
        }
      }
    });

    this.plugin.addCommand({
      id: 'ai-continue-writing',
      name: 'Continue writing from cursor',
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'C' }],
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const textBeforeCursor = line.substring(0, cursor.ch);
        const textAfterCursor = line.substring(cursor.ch);
        const context = textBeforeCursor + (textAfterCursor ? ' ' + textAfterCursor : '');
        
        if (context.trim().length > 0) {
          this.continueWriting(editor, context);
        } else {
          new Notice('No text context found at cursor');
        }
      }
    });
  }

  async askAboutSelection(editor, selection) {
    const prompt = await this.showPromptModal('What would you like to ask about this selection?');
    if (!prompt) return;

    const fullPrompt = `Context from my note:\n\n${selection}\n\nMy question: ${prompt}`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n--- 🤖 AI Response ---\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
      
      editor.replaceRange('\n\n---\n\n', editor.getCursor());
    } catch (error) {
      editor.replaceRange(`\n\n⨉ Error: ${error.message}\n\n`, editor.getCursor());
      new Notice('AI Error: ' + error.message);
    }
  }

  async editSelection(editor, selection) {
    const prompt = await this.showPromptModal('How would you like to edit this text? (e.g., "make it formal", "summarize", "fix grammar")');
    if (!prompt) return;

    const fullPrompt = `Original text:\n\n${selection}\n\nInstructions: ${prompt}\n\nEdited version:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    const tempCursor = { line: cursor.line, ch: cursor.ch };
    
    editor.replaceRange('⏳ Editing...', cursor, to);
    
    try {
      let fullResponse = '';
      await this.streamAIResponse(fullPrompt, (chunk) => {
        fullResponse += chunk;
        editor.replaceRange(fullResponse, tempCursor, { 
          line: tempCursor.line, 
          ch: tempCursor.ch + 1000 
        });
      });
      
      editor.replaceRange(fullResponse, tempCursor, { 
        line: tempCursor.line, 
        ch: tempCursor.ch + 1000 
      });
    } catch (error) {
      editor.replaceRange(selection, tempCursor, { 
        line: tempCursor.line, 
        ch: tempCursor.ch + 1000 
      });
      new Notice('AI Error: ' + error.message);
    }
  }

  async continueWriting(editor, context) {
    const fullPrompt = `Continue the following text naturally:\n\n${context}\n\n`;
    
    const cursor = editor.getCursor('to');
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async translateSelection(editor, selection) {
    const targetLanguage = await this.showPromptModal('Translate to which language?');
    if (!targetLanguage) return;

    const fullPrompt = `Translate the following text to ${targetLanguage}:\n\n${selection}\n\nTranslation:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    
    editor.replaceRange(`\n\n[${targetLanguage} translation]:\n`, cursor, to);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
      
      editor.replaceRange('\n\n', editor.getCursor());
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async summarizeText(editor, selection) {
    const fullPrompt = `Summarize the following text concisely:\n\n${selection}\n\nSummary:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n📝 Summary:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async expandText(editor, selection) {
    const fullPrompt = `Expand and elaborate on the following text, adding more details and depth:\n\n${selection}\n\nExpanded version:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n🔍 Expanded:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async generateQuestions(editor, selection) {
    const fullPrompt = `Generate 5 thoughtful questions based on this text:\n\n${selection}\n\nQuestions:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n? Questions:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async extractKeywords(editor, selection) {
    const fullPrompt = `Extract the most important keywords and key phrases from this text:\n\n${selection}\n\nKeywords:`;
    
    const cursor = editor.getCursor('to');
    editor.replaceRange('\n\n🔑 Keywords:\n\n', cursor);
    
    try {
      await this.streamAIResponse(fullPrompt, (chunk) => {
        editor.replaceRange(chunk, editor.getCursor());
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  async changeTone(editor, selection, tone) {
    const toneMap = {
      professional: 'professional and formal',
      casual: 'casual and friendly',
      academic: 'academic and scholarly',
      poetic: 'poetic and literary',
      technical: 'technical and precise',
      simple: 'simple and easy to understand'
    };
    
    const fullPrompt = `Rewrite the following text in a ${toneMap[tone] || tone} tone:\n\n${selection}\n\nRewritten version:`;
    
    const cursor = editor.getCursor('from');
    const to = editor.getCursor('to');
    
    try {
      let fullResponse = '';
      await this.streamAIResponse(fullPrompt, (chunk) => {
        fullResponse += chunk;
        editor.replaceRange(fullResponse, cursor, to);
      });
    } catch (error) {
      new Notice('AI Error: ' + error.message);
    }
  }

  addMoreAIOptions(submenu, editor, selection) {
    submenu.addItem((item) => {
      item.setTitle('📊 Summarize')
          .setIcon('file-text')
          .onClick(() => this.summarizeText(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('🔍 Expand')
          .setIcon('plus-circle')
          .onClick(() => this.expandText(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('❓ Generate questions')
          .setIcon('help-circle')
          .onClick(() => this.generateQuestions(editor, selection));
    });
    
    submenu.addItem((item) => {
      item.setTitle('🔑 Extract keywords')
          .setIcon('key')
          .onClick(() => this.extractKeywords(editor, selection));
    });
    
    submenu.addSeparator();
    
    submenu.addItem((item) => {
      item.setTitle('Professional tone')
          .setIcon('briefcase')
          .onClick(() => this.changeTone(editor, selection, 'professional'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Casual tone')
          .setIcon('smile')
          .onClick(() => this.changeTone(editor, selection, 'casual'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Academic tone')
          .setIcon('graduation-cap')
          .onClick(() => this.changeTone(editor, selection, 'academic'));
    });
    
    submenu.addItem((item) => {
      item.setTitle('Technical tone')
          .setIcon('code')
          .onClick(() => this.changeTone(editor, selection, 'technical'));
    });
    
    submenu.addSeparator();
    
    submenu.addItem((item) => {
      item.setTitle('Copy to clipboard')
          .setIcon('copy')
          .onClick(() => {
            navigator.clipboard.writeText(selection);
            new Notice('Selection copied to clipboard');
          });
    });
  }

  async streamAIResponse(prompt, onChunk) {
    const session = this.plugin._sessionManager.getActive();
    
    if (session) {
      this.plugin._sessionManager.addMessage('user', prompt);
    }

    const result = await this.plugin.apiManager.sendMessage({
      messages: session ? this.plugin._sessionManager.getMessagesForRequest() : [{ role: 'user', content: prompt }],
      temperature: this.plugin.settings.temperature,
      max_tokens: this.plugin.settings.max_tokens,
      stream: true
    }, {
      onChunk: onChunk,
      timeoutMs: this.plugin.settings.timeoutMs
    });

    if (session && result.final) {
      this.plugin._sessionManager.addMessage('assistant', result.final);
      this.plugin.saveState();
    }

    return result.final;
  }

  async showPromptModal(placeholder) {
    return new Promise((resolve) => {
      const modal = new PromptModal(
        this.plugin.app,
        'AI Assistant',
        '',
        (result) => resolve(result)
      );
      
      modal.open();
    });
  }
}

// ==================== CHAT SIDEBAR VIEW ====================

class ChatView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.containerEl.addClass('ai-sidebar');
    this._streaming = true;
    this.pendingAttachments = [];
    this.isNamingInProgress = false; // Flag to prevent multiple naming attempts
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'AI Assistant'; }
  getIcon() { return 'brain'; }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass('ai-sidebar');
    this.containerEl.style.direction = 'ltr';
    this.containerEl.style.textAlign = 'left';
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    this.containerEl.style.height = '100%';
    this.containerEl.style.padding = '8px';
    this.containerEl.style.gap = '8px';
    this.containerEl.style.boxSizing = 'border-box';

    const topBar = this.containerEl.createDiv({ cls: 'ai-top-bar' });
    topBar.style.display = 'flex';
    topBar.style.justifyContent = 'flex-start';
    topBar.style.alignItems = 'center';
    topBar.style.height = '36px';
    topBar.style.width = '100%';
    topBar.style.gap = '8px';

    // Header buttons
    this.shortcutsBtn = topBar.createEl('button', {
      cls: 'ai-shortcuts-btn'
    });
    setIcon(this.shortcutsBtn, 'command');
    this.styleButton(this.shortcutsBtn);
    this.shortcutsBtn.title = 'Shortcuts';

    this.modeToggleBtn = topBar.createEl('button', {
      cls: 'ai-mode-toggle'
    });
    setIcon(this.modeToggleBtn, this.getProviderIcon());
    this.styleButton(this.modeToggleBtn);
    this.modeToggleBtn.title = this.getProviderInfo();

    this.tempChatBtn = topBar.createEl('button', {
      cls: 'ai-temp-chat-btn'
    });
    setIcon(this.tempChatBtn, 'message-square-dashed');
    this.styleButton(this.tempChatBtn);
    this.tempChatBtn.title = 'New Temporary Chat (unsaved)';

    this.tokenCounter = topBar.createDiv({ 
      cls: 'ai-token-counter'
    });
    this.tokenCounter.style.fontSize = '11px';
    this.tokenCounter.style.padding = '4px 8px';
    this.tokenCounter.style.borderRadius = '12px';
    this.tokenCounter.style.background = 'transparent';
    this.tokenCounter.style.color = 'var(--text-muted)';
    this.tokenCounter.style.border = '1px solid var(--background-modifier-border)';
    this.tokenCounter.style.display = 'flex';
    this.tokenCounter.style.alignItems = 'center';
    this.tokenCounter.style.justifyContent = 'center';
    this.tokenCounter.style.gap = '4px';
    this.tokenCounter.style.minWidth = '70px';
    this.tokenCounter.style.height = '24px';
    
    const tokenIcon = this.tokenCounter.createSpan();
    setIcon(tokenIcon, 'binary');
    tokenIcon.style.display = 'flex';
    
    const tokenText = this.tokenCounter.createSpan();
    tokenText.textContent = '0/8192';
    
    this.updateTokenCounterVisibility();

    const spacer = topBar.createDiv({ cls: 'ai-top-spacer' });
    spacer.style.flex = '1';

    this.settingsBtn = topBar.createEl('button', { 
      cls: 'ai-settings-btn'
    });
    setIcon(this.settingsBtn, 'settings');
    this.styleButton(this.settingsBtn);
    this.settingsBtn.title = 'Settings';

    // Events
    this.modeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAIMode();
    });

    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const settingsModal = new SettingsModal(this.app, this.plugin);
      settingsModal.open();
    });

    this.shortcutsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showShortcutsMenu();
    });

    this.tempChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.createTemporaryChat();
    });

    // Check preferred input position
    const inputPosition = this.plugin.settings.inputPosition || 'bottom';
    
    if (inputPosition === 'bottom') {
      // Default: chat at top, input at bottom
      await this.createChatArea();
      await this.createInputArea();
    } else {
      // Reversed: input at top, chat at bottom
      await this.createInputArea();
      await this.createChatArea();
    }

    this._renderMessages();
    this._streaming = true;
    
    if (this.plugin.settings.showTokenCounter) {
      this.inputEl.addEventListener('input', () => this._updateTokenCounter());   
      setTimeout(() => this._updateTokenCounter(), 100);
    }
  }

  // Method to create chat area
  async createChatArea() {
    this.chatEl = this.containerEl.createDiv({ cls: 'ai-chat' });
    this.chatEl.style.flex = '1';
    this.chatEl.style.overflowY = 'auto';
    this.chatEl.style.padding = '16px';
    this.chatEl.style.borderRadius = '8px';
    this.chatEl.style.background = 'var(--background-primary)';
    this.chatEl.style.border = '1px solid var(--background-modifier-border)';
    this.chatEl.style.margin = '4px 0';
    this.chatEl.style.display = 'flex';
    this.chatEl.style.flexDirection = 'column';
  }

  // Method to create input area
  async createInputArea() {
    const inputWrap = this.containerEl.createDiv({ cls: 'ai-input-wrap' });
    inputWrap.style.position = 'relative';
    inputWrap.style.width = '100%';
    inputWrap.style.marginTop = 'auto';
    inputWrap.style.paddingTop = '8px';
    inputWrap.style.borderTop = '1px solid var(--background-modifier-border)';
    
    this.inputEl = inputWrap.createEl('textarea', { 
      cls: 'ai-input',
      attr: { 
        placeholder: 'Type a message... (Shift+Enter send)',
        rows: '2'
      }
    });
    this.inputEl.style.width = '100%';
    this.inputEl.style.resize = 'vertical';
    this.inputEl.style.padding = '12px';
    this.inputEl.style.paddingBottom = '60px';
    this.inputEl.style.borderRadius = '8px';
    this.inputEl.style.border = '1px solid var(--background-modifier-border)';
    this.inputEl.style.background = 'var(--background-secondary)';
    this.inputEl.style.color = 'var(--text-normal)';
    this.inputEl.style.fontSize = '15px';
    this.inputEl.style.minHeight = '120px';
    this.inputEl.style.maxHeight = '300px';
    this.inputEl.style.lineHeight = '1.5';

    this.attachBtn = inputWrap.createEl('button', { 
      text: '+', 
      cls: 'ai-attach-btn floating-btn'
    });
    this.styleFloatingButton(this.attachBtn);
    this.attachBtn.style.bottom = '60px';
    this.attachBtn.title = 'Attach files';

    this.sendBtn = inputWrap.createEl('button', { 
      text: '➤', 
      cls: 'ai-send-btn floating-btn' 
    });
    this.styleFloatingButton(this.sendBtn);
    this.sendBtn.style.bottom = '15px';
    this.sendBtn.title = 'Send';

    this.sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._onSend();
    });
    
    this.attachBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._onAttach();
    });
    
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this._onSend();
      }
    });
  }
  
  async refreshLayout() {
    // Save references to current elements
    const oldChatEl = this.chatEl;
    const oldInputWrap = this.inputEl?.parentElement;
    
    // Remove old elements
    if (oldChatEl) oldChatEl.remove();
    if (oldInputWrap) oldInputWrap.remove();
    
    // Recreate based on new setting
    const inputPosition = this.plugin.settings.inputPosition || 'bottom';
    
    if (inputPosition === 'bottom') {
      await this.createChatArea();
      await this.createInputArea();
    } else {
      await this.createInputArea();
      await this.createChatArea();
    }
    
    // Re-render messages
    this._renderMessages();
  }

  // Helper methods for button styling
  styleButton(btn) {
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.color = 'var(--text-normal)';
    btn.style.padding = '4px 8px';
    btn.style.borderRadius = '4px';
    btn.style.width = '32px';
    btn.style.height = '32px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  }

  styleFloatingButton(btn) {
    btn.style.position = 'absolute';
    btn.style.width = '36px';
    btn.style.height = '36px';
    btn.style.borderRadius = '50%';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.fontSize = '16px';
    btn.style.zIndex = '100';
    btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
    btn.style.right = '15px';
    btn.style.background = 'var(--interactive-accent)';
    btn.style.color = 'var(--text-on-accent)';
  }

  // Method to create temporary chat
  createTemporaryChat() {
    this.plugin._sessionManager.createTemporary('Temporary Chat');
    this._renderMessages();
    this.plugin.saveState(); // Doesn't save temporary, only regular sessions
    new Notice('Temporary chat created (will be deleted when switching or closing)');
  }

  /**
   * Create a new conversation with optional auto-naming
   */
  createNewConversation() {
    const name = prompt('New conversation name (leave empty for auto-name):', '');
    
    if (name !== null) {
      if (name.trim()) {
        // User provided a name
        this.plugin._sessionManager.create(name.trim());
        this._renderMessages();
        this.plugin.saveState();
        new Notice(`✓ Created conversation: ${name}`);
      } else {
        // User left it empty, create with default name first
        const session = this.plugin._sessionManager.create('New Conversation');
        this._renderMessages();
        this.plugin.saveState();
        
        // Notify about auto-naming if enabled
        if (this.plugin.settings.autoNameConversations) {
          new Notice('Conversation will be auto-named after first message');
        } else {
          new Notice('✓ Created new conversation');
        }
      }
    }
  }

  /**
   * Rename the current conversation
   */
  renameCurrentConversation() {
    const session = this.plugin._sessionManager.getActive();
    if (!session) {
      new Notice('No active conversation to rename');
      return;
    }
    
    const newName = prompt('Enter new conversation name:', session.name);
    if (newName && newName.trim()) {
      session.name = newName.trim();
      this.plugin.saveState();
      new Notice(`✓ Conversation renamed to: ${newName}`);
      
      // Refresh the conversations tab in settings if it's open
      this.plugin.refreshChatViews();
    }
  }

  /**
   * Show a temporary naming indicator in the UI
   */
  showNamingIndicator() {
    // Create or update naming indicator in the top bar
    if (!this.namingIndicator) {
      this.namingIndicator = this.containerEl.createDiv({ cls: 'ai-naming-indicator' });
      this.namingIndicator.style.marginLeft = '8px';
      this.namingIndicator.style.fontSize = '11px';
      this.namingIndicator.style.color = 'var(--text-muted)';
      
      const iconSpan = this.namingIndicator.createSpan();
      setIcon(iconSpan, 'loader');
      iconSpan.style.marginRight = '4px';
      iconSpan.style.animation = 'spin 1s linear infinite';
      
      const textSpan = this.namingIndicator.createSpan();
      textSpan.textContent = 'Naming conversation...';
      
      // Insert after the rename button
      const renameBtn = this.containerEl.querySelector('.ai-rename-btn');
      if (renameBtn && renameBtn.parentElement) {
        renameBtn.parentElement.insertBefore(this.namingIndicator, renameBtn.nextSibling);
      }
    }
    this.namingIndicator.style.display = 'flex';
  }

  /**
   * Hide the naming indicator
   */
  hideNamingIndicator() {
    if (this.namingIndicator) {
      this.namingIndicator.style.display = 'none';
    }
  }

  async saveCurrentConversation() {
    const session = this.plugin._sessionManager.getActive();
    if (!session) {
        new Notice('No active conversation to save');
        return;
    }
    try {
        const content = this.plugin._sessionManager.exportToMarkdown(session);
        const folderPath = this.plugin.settings.conversationsFolder || 'AI Conversations';
        const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
        
        // Ensure folder exists
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
            await this.app.vault.createFolder(folderPath);
        }
        
        // Get unique file path
        const fullPath = await this.plugin.getUniqueFilePath(folderPath, baseName, 'md');
        
        await this.app.vault.create(fullPath, content);
        new Notice(`✓ Conversation saved to: ${fullPath}`);
    } catch (error) {
        console.error('Error saving conversation:', error);
        new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }

  updateTokenCounterVisibility() {
    if (!this.tokenCounter) return;
    
    if (this.plugin.settings.showTokenCounter) {
      this.tokenCounter.style.display = 'flex';
    } else {
      this.tokenCounter.style.display = 'none';
    }
  }

  showShortcutsMenu() {
    const existingMenus = document.querySelectorAll('.ai-shortcuts-menu');
    existingMenus.forEach(menu => menu.remove());
    
    const menu = document.createElement('div');
    menu.className = 'ai-shortcuts-menu';
    menu.style.position = 'fixed';
    menu.style.background = 'var(--background-primary)';
    menu.style.border = '1px solid var(--background-modifier-border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '10px';
    menu.style.minWidth = '200px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    menu.style.zIndex = '9999';
    menu.style.backdropFilter = 'blur(10px)';
    
    const shortcuts = [
      { key: 'New Conversation', shortcut: this.plugin.settings.shortcuts.newConversation, action: () => this.createNewConversation() },
      { key: 'Rename Conversation', shortcut: 'Ctrl+Shift+R', action: () => this.renameCurrentConversation() },
      { key: 'Save Conversation', shortcut: this.plugin.settings.shortcuts.saveConversation, action: () => this.saveCurrentConversation() },
      { key: 'Settings', shortcut: this.plugin.settings.shortcuts.settings, action: () => {
        const settingsModal = new SettingsModal(this.app, this.plugin);
        settingsModal.open();
      }},
      { key: 'Ask Selection', shortcut: this.plugin.settings.shortcuts.askSelection || 'Ctrl+Shift+A', action: () => {
        new Notice('Use this shortcut in the editor with text selected');
      }},
      { key: 'Edit Selection', shortcut: this.plugin.settings.shortcuts.editSelection || 'Ctrl+Shift+E', action: () => {
        new Notice('Use this shortcut in the editor with text selected');
      }}
    ];
    
    shortcuts.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'shortcut-item';
      menuItem.style.padding = '8px 12px';
      menuItem.style.cursor = 'pointer';
      menuItem.style.fontSize = '13px';
      menuItem.style.color = 'var(--text-normal)';
      menuItem.style.borderBottom = '1px solid var(--background-modifier-border)';
      menuItem.style.display = 'flex';
      menuItem.style.justifyContent = 'space-between';
      menuItem.style.alignItems = 'center';
      
      const keySpan = document.createElement('span');
      keySpan.className = 'shortcut-key';
      keySpan.style.fontWeight = '600';
      keySpan.textContent = item.key;
      
      const shortcutSpan = document.createElement('span');
      shortcutSpan.className = 'shortcut-value';
      shortcutSpan.style.fontFamily = 'monospace';
      shortcutSpan.style.fontSize = '12px';
      shortcutSpan.style.color = 'var(--text-muted)';
      shortcutSpan.style.background = 'var(--background-secondary)';
      shortcutSpan.style.padding = '2px 6px';
      shortcutSpan.style.borderRadius = '4px';
      shortcutSpan.style.border = '1px solid var(--background-modifier-border)';
      shortcutSpan.textContent = item.shortcut;
      
      menuItem.appendChild(keySpan);
      menuItem.appendChild(shortcutSpan);
      
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      
      menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    const btnRect = this.shortcutsBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    
    let top = btnRect.bottom + 5;
    let left = btnRect.left;
    
    if (top + menuRect.height > window.innerHeight) {
      top = btnRect.top - menuRect.height - 5;
    }
    
    if (left + menuRect.width > window.innerWidth) {
      left = btnRect.right - menuRect.width;
    }
    
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== this.shortcutsBtn) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 10);
  }

  getProviderIcon() {
    return this.plugin.apiManager.getCurrentProviderIcon();
  }

  getProviderName() {
    return this.plugin.apiManager.getCurrentProviderName();
  }

  getProviderInfo() {
    if (this.plugin.settings.currentMode === 'local') {
      return `${this.plugin.settings.localModel} - Click to switch to cloud`;
    } else {
      return `${this.getProviderName()} - Click to switch to local`;
    }
  }

  toggleAIMode() {
    this.plugin.settings.currentMode = 
      this.plugin.settings.currentMode === 'local' ? 'cloud' : 'local';
    
    this.modeToggleBtn.empty();
    setIcon(this.modeToggleBtn, this.getProviderIcon());
    this.modeToggleBtn.title = this.getProviderInfo();
    
    this.plugin.saveSettings();
    new Notice(`Switched to ${this.getProviderName()}`);
    this._updateTokenCounter();
  }

  _updateTokenCounter() {
    if (!this.plugin.settings.showTokenCounter || !this.tokenCounter || this.tokenCounter.style.display === 'none') return;
    
    const text = this.inputEl.value;
    const estimatedTokens = estimateTokens(text);
    
    const s = this.plugin._sessionManager.getActive();
    let contextTokens = 0;
    if (s) {
      const messages = this.plugin._sessionManager.getMessagesForRequest(10);
      messages.forEach(m => contextTokens += estimateTokens(m.content));
    }
    
    const totalTokens = estimatedTokens + contextTokens;
    const maxTokens = 8192;
    
    const providerName = this.getProviderName();
    
    if (this.tokenCounter) {
      this.tokenCounter.empty();
      const tokenIcon = this.tokenCounter.createSpan();
      setIcon(tokenIcon, 'binary');
      tokenIcon.style.display = 'flex';
      
      const tokenText = this.tokenCounter.createSpan();
      tokenText.textContent = `${totalTokens}/${maxTokens}`;
      this.tokenCounter.title = `${providerName}\nContext: ${contextTokens} | Input: ${estimatedTokens}`;
      
      if (totalTokens > maxTokens) {
        this.tokenCounter.style.color = 'var(--text-error)';
        this.tokenCounter.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.2)';
      } else if (totalTokens > maxTokens * 0.8) {
        this.tokenCounter.style.color = 'var(--text-warning)';
        this.tokenCounter.style.backgroundColor = 'rgba(var(--background-modifier-warning-rgb), 0.2)';
      } else {
        this.tokenCounter.style.color = 'var(--text-muted)';
        this.tokenCounter.style.backgroundColor = 'transparent';
      }
    }
  }

  _renderMessages() {
    this.chatEl.empty();
    const s = this.plugin._sessionManager.getActive();
    if (!s) return;
    
    s.messages.forEach(m => this._appendBubble(m.role, m.content, m.attachments));
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  _appendBubble(role, text, attachments = []) {
    const msgContainer = this.chatEl.createDiv({ cls: `ai-msg-container ${role}` });
    msgContainer.style.marginBottom = '16px';
    msgContainer.style.maxWidth = '88%';
    msgContainer.style.alignSelf = role === 'user' ? 'flex-start' : 'flex-end';
    
    const bubble = msgContainer.createDiv({ cls: `ai-msg ${role}` });
    bubble.style.padding = '12px 16px';
    bubble.style.borderRadius = role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px';
    bubble.style.lineHeight = '1.5';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-word';
    bubble.style.fontSize = '14px';
    
    if (role === 'user') {
      bubble.style.background = 'var(--interactive-accent)';
      bubble.style.color = 'var(--text-on-accent)';
      bubble.textContent = text;
    } else {
      bubble.style.background = 'var(--background-secondary)';
      bubble.style.color = 'var(--text-normal)';
      MarkdownRenderer.render(this.app, text, bubble, '', this.plugin);
    }
    
    if (attachments && attachments.length > 0) {
      const attachmentsContainer = msgContainer.createDiv({ cls: 'ai-attachments-container' });
      attachmentsContainer.style.marginTop = '8px';
      attachmentsContainer.style.padding = '10px';
      attachmentsContainer.style.background = 'rgba(var(--interactive-accent-rgb), 0.1)';
      attachmentsContainer.style.borderRadius = '8px';
      attachmentsContainer.style.border = '1px dashed var(--background-modifier-border)';
      
      attachmentsContainer.createEl('div', { 
        text: 'Attachments:', 
        cls: 'ai-attachments-title' 
      }).style.fontSize = '12px';
      
      attachments.forEach(attachment => {
        const attachmentEl = attachmentsContainer.createDiv({ cls: 'ai-attachment' });
        attachmentEl.style.display = 'flex';
        attachmentEl.style.alignItems = 'center';
        attachmentEl.style.padding = '6px 8px';
        attachmentEl.style.background = 'var(--background-primary)';
        attachmentEl.style.borderRadius = '6px';
        attachmentEl.style.marginBottom = '4px';
        attachmentEl.style.border = '1px solid var(--background-modifier-border)';
        
        attachmentEl.createEl('div', { 
          text: `${attachment.name}`, 
          cls: 'ai-attachment-name' 
        }).style.fontSize = '13px';
      });
    }
    
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
    return bubble;
  }

  async _onAttach() {
    const modal = new AttachModal(this.app, async (choice, files) => {
      if (!files || !files.length) { 
        new Notice('No files selected'); 
        return; 
      }
      
      this.pendingAttachments = [];
      
      for (const f of files) {
        try {
          const data = await this.app.vault.read(f);
          const trimmedContent = trimContent(data, 3500);
          this.pendingAttachments.push({
            name: f.basename,
            path: f.path,
            content: trimmedContent
          });
        } catch (e) { 
          console.error(e); 
          new Notice(`Error reading file: ${f.path}`);
        }
      }
      
      const attachmentCount = this.pendingAttachments.length;
      if (attachmentCount > 0) {
        //this.inputEl.value += `\n- 📎 ${attachmentCount} file${attachmentCount > 1 ? 's' : ''} attached`;
        new Notice(`✓ ${attachmentCount} file${attachmentCount > 1 ? 's' : ''} ready to attach`);
      }
    });
    modal.open();
  }

  async _onSend() {
    const txt = this.inputEl.value.trim();
    if (!txt && this.pendingAttachments.length === 0) { 
      new Notice('Message is empty'); 
      return; 
    }
    
    let s = this.plugin._sessionManager.getActive();
    if (!s) { 
      this.plugin._sessionManager.create('New Conversation');
      s = this.plugin._sessionManager.getActive();
    }
    
    // Check if this is the first user message and conversation needs naming
    const isFirstMessage = s.messages.length === 0;
    const needsNaming = isFirstMessage && 
                        this.plugin.settings.autoNameConversations && 
                        !this.isNamingInProgress &&
                        (!s.name || s.name === 'New Conversation' || s.name.startsWith('Session '));
    
    // Add user message with attachments
    this.plugin._sessionManager.addMessage('user', txt, this.pendingAttachments);
    this.plugin.saveState();
    
    // Display user message
    this._appendBubble('user', txt, this.pendingAttachments);
    
    // Clear input and attachments
    this.inputEl.value = '';
    const currentAttachments = [...this.pendingAttachments];
    this.pendingAttachments = [];

    // Auto-name the conversation if needed
    if (needsNaming) {
      this.isNamingInProgress = true;
      this.showNamingIndicator();
      
      try {
        const generatedName = await this.plugin.generateConversationName(txt);
        
        if (generatedName) {
          // Update the session name
          s.name = generatedName;
          this.plugin.saveState();
          new Notice(`✓ Conversation named: "${generatedName}"`);
        }
      } catch (error) {
        console.log("Auto-naming failed:", error);
        // Silent fail - keep default name
      } finally {
        this.isNamingInProgress = false;
        this.hideNamingIndicator();
      }
    }

    const messages = this.plugin._sessionManager.getMessagesForRequest();

    let acc = '';
    let hasReceivedContent = false;
    
    // Create an empty message container for streaming
    const msgContainer = this.chatEl.createDiv({ cls: `ai-msg-container assistant` });
    msgContainer.style.marginBottom = '16px';
    msgContainer.style.maxWidth = '88%';
    msgContainer.style.alignSelf = 'flex-end';
    
    const streamingMsg = msgContainer.createDiv({ cls: `ai-msg assistant` });
    streamingMsg.style.padding = '12px 16px';
    streamingMsg.style.borderRadius = '12px 12px 12px 4px';
    streamingMsg.style.background = 'var(--background-secondary)';
    streamingMsg.style.color = 'var(--text-normal)';
    streamingMsg.style.lineHeight = '1.5';
    streamingMsg.style.whiteSpace = 'pre-wrap';
    streamingMsg.style.wordBreak = 'break-word';
    streamingMsg.style.fontSize = '14px';
    streamingMsg.textContent = ''; // Start empty
    
    try {
      const result = await this.plugin.apiManager.sendMessage({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: true
      }, {
        onChunk: (chunk) => {
          // Only process non-empty chunks
          if (chunk && chunk.trim().length > 0) {
            acc += chunk;
            hasReceivedContent = true;
            streamingMsg.textContent = acc;
            this.chatEl.scrollTop = this.chatEl.scrollHeight;
          }
        },
        timeoutMs: this.plugin.settings.timeoutMs
      });
      
      const finalText = (result && result.final) ? result.final : acc;
      
      // If we never received any content but have a final result
      if (!hasReceivedContent && finalText) {
        streamingMsg.textContent = finalText;
      }
      
      // If we received content, render it with Markdown
      if (hasReceivedContent || finalText) {
        const displayText = finalText || acc;
        streamingMsg.empty();
        MarkdownRenderer.render(this.app, displayText, streamingMsg, '', this.plugin);
        
        // Add assistant message to history
        this.plugin._sessionManager.addMessage('assistant', displayText, currentAttachments);
        this.plugin.saveState();
      } else {
        // If no content at all, show an error
        streamingMsg.textContent = '⨉ No response received';
      }
      
    } catch (e) {
      console.error("Chat Error:", e);
      
      let errorMessage = '⨉ Error occurred';
      if (e.message.includes('429')) {
        errorMessage = '⏳ Rate limit exceeded. Please wait a moment and try again Or Try changing the model.';
      } else if (e.message.includes('401') || e.message.includes('403')) {
        errorMessage = '🔐 Authentication failed. Please check your API key.';
      } else if (e.message.includes('timeout')) {
        errorMessage = '⏱️ Request timed out. Check your internet connection.';
      } else if (e.message.includes('fetch') || e.message.includes('Failed to fetch')) {
        errorMessage = '🌐 Cannot connect to Local AI. Please check if the server is running at ' + this.plugin.settings.baseUrl;
      } else {
        errorMessage = `⨉ Error: ${e.message}`;
      }
      
      streamingMsg.textContent = errorMessage;
      new Notice(errorMessage);
    }
  }
}

// ==================== SETTINGS MODAL ====================

class SettingsModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.minWidth = '100%';
    contentEl.style.maxWidth = '100%';
    
    const h2 = contentEl.createEl('h2');
    h2.style.display = 'flex';
    h2.style.alignItems = 'center';
    const h2Icon = h2.createSpan();
    setIcon(h2Icon, 'settings');
    h2Icon.style.marginRight = '8px';
    h2.appendChild(document.createTextNode('AI Assistant Settings'));
    
    const tabsContainer = contentEl.createDiv({ cls: 'ai-settings-tabs' });
    tabsContainer.style.display = 'flex';
    tabsContainer.style.gap = '8px';
    tabsContainer.style.marginBottom = '20px';
    tabsContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    tabsContainer.style.paddingBottom = '10px';
    tabsContainer.style.flexWrap = 'wrap';
    
    const localTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn active' });
    const localIcon = localTab.createSpan();
    setIcon(localIcon, 'monitor-speaker');
    localIcon.style.marginRight = '6px';
    localIcon.style.display = 'inline-flex';
    localTab.appendChild(document.createTextNode('Local Model'));
    
    const cloudTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const cloudIcon = cloudTab.createSpan();
    setIcon(cloudIcon, 'server');
    cloudIcon.style.marginRight = '6px';
    cloudIcon.style.display = 'inline-flex';
    cloudTab.appendChild(document.createTextNode('Cloud Model'));
    
    const generalTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const generalIcon = generalTab.createSpan();
    setIcon(generalIcon, 'settings');
    generalIcon.style.marginRight = '6px';
    generalIcon.style.display = 'inline-flex';
    generalTab.appendChild(document.createTextNode('General'));
    
    const shortcutsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const shortcutsIcon = shortcutsTab.createSpan();
    setIcon(shortcutsIcon, 'command');
    shortcutsIcon.style.marginRight = '6px';
    shortcutsIcon.style.display = 'inline-flex';
    shortcutsTab.appendChild(document.createTextNode('Shortcuts'));
    
    const conversationsTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const convIcon = conversationsTab.createSpan();
    setIcon(convIcon, 'message-square');
    convIcon.style.marginRight = '6px';
    convIcon.style.display = 'inline-flex';
    conversationsTab.appendChild(document.createTextNode('Conversations'));
    
    const namingTab = tabsContainer.createEl('button', { cls: 'ai-tab-btn' });
    const namingIcon = namingTab.createSpan();
    setIcon(namingIcon, 'type');
    namingIcon.style.marginRight = '6px';
    namingIcon.style.display = 'inline-flex';
    namingTab.appendChild(document.createTextNode('Auto-Naming'));
    
    [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab].forEach(tab => {
      tab.style.padding = '10px 16px';
      tab.style.border = 'none';
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.cursor = 'pointer';
      tab.style.borderRadius = '6px';
      tab.style.fontSize = '14px';
      tab.style.display = 'flex';
      tab.style.alignItems = 'center';
    });
    
    const contentContainer = contentEl.createDiv({ cls: 'ai-settings-content' });
    contentContainer.style.maxHeight = '400px';
    contentContainer.style.overflowY = 'auto';
    contentContainer.style.paddingRight = '10px';
    contentContainer.style.marginBottom = '20px';
    
    this.showLocalSettings(contentContainer);
    
    localTab.addEventListener('click', () => {
      this.setActiveTab(localTab, [cloudTab, generalTab, shortcutsTab, conversationsTab, namingTab]);
      this.showLocalSettings(contentContainer);
    });
    
    cloudTab.addEventListener('click', () => {
      this.setActiveTab(cloudTab, [localTab, generalTab, shortcutsTab, conversationsTab, namingTab]);
      this.showCloudSettings(contentContainer);
    });
    
    generalTab.addEventListener('click', () => {
      this.setActiveTab(generalTab, [localTab, cloudTab, shortcutsTab, conversationsTab, namingTab]);
      this.showGeneralSettings(contentContainer);
    });
    
    shortcutsTab.addEventListener('click', () => {
      this.setActiveTab(shortcutsTab, [localTab, cloudTab, generalTab, conversationsTab, namingTab]);
      this.showShortcutsSettings(contentContainer);
    });
    
    conversationsTab.addEventListener('click', () => {
      this.setActiveTab(conversationsTab, [localTab, cloudTab, generalTab, shortcutsTab, namingTab]);
      this.showConversationsSettings(contentContainer);
    });
    
    namingTab.addEventListener('click', () => {
      this.setActiveTab(namingTab, [localTab, cloudTab, generalTab, shortcutsTab, conversationsTab]);
      this.showNamingSettings(contentContainer);
    });
  }

  setActiveTab(activeTab, otherTabs) {
    activeTab.classList.add('active');
    activeTab.style.background = 'var(--interactive-accent)';
    activeTab.style.color = 'var(--text-on-accent)';
    activeTab.style.fontWeight = '600';
    
    otherTabs.forEach(tab => {
      tab.classList.remove('active');
      tab.style.background = 'transparent';
      tab.style.color = 'var(--text-muted)';
      tab.style.fontWeight = 'normal';
    });
  }
  
  showLocalSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'monitor-speaker');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Local Model Configuration'));
    
    this.createInputField(section, 'Base URL:', 'baseUrl', this.plugin.settings.baseUrl, 'text', 'http://127.0.0.1:11434');
    this.createInputField(section, 'Endpoint:', 'localEndpoint', this.plugin.settings.localEndpoint, 'text', '/v1/chat/completions');
    this.createInputField(section, 'Model Name:', 'localModel', this.plugin.settings.localModel, 'text', 'llama2');
    
    const testBtn = section.createEl('button', { cls: 'ai-test-btn' });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'refresh-cw');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    const testText = testBtn.createSpan();
    testText.textContent = 'Test Connection';
    testText.style.verticalAlign = 'middle';
    
    testBtn.style.width = '100%';
    testBtn.style.padding = '12px';
    testBtn.style.borderRadius = '8px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--background-secondary)';
    testBtn.style.color = 'var(--text-normal)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '14px';
    testBtn.style.marginTop = '10px';
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      
      try {
        const provider = new LocalAIProvider(this.plugin);
        const health = await provider.checkHealth();
        if (health.ok) {
          new Notice('✓ ' + health.message);
        } else {
          new Notice('⨉ ' + health.message);
        }
      } catch (e) {
        new Notice('⨉ Error: ' + e.message);
      } finally {
        testBtn.disabled = false;
        testBtn.empty();
        const icon = testBtn.createSpan();
        setIcon(icon, 'refresh-cw');
        icon.style.marginRight = '6px';
        icon.style.display = 'inline-flex';
        icon.style.verticalAlign = 'middle';
        const text = testBtn.createSpan();
        text.textContent = 'Test Connection';
        text.style.verticalAlign = 'middle';
      }
    });
  }
  
  showCloudSettings(container) {
    container.empty();
    
    const apiTypeSection = container.createDiv({ cls: 'ai-settings-section' });
    apiTypeSection.style.background = 'var(--background-secondary)';
    apiTypeSection.style.borderRadius = '8px';
    apiTypeSection.style.padding = '20px';
    apiTypeSection.style.marginBottom = '20px';
    apiTypeSection.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = apiTypeSection.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'server');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Cloud Provider Selection'));

    this.createAPITypeSelector(apiTypeSection);

    const settingsContainer = container.createDiv({ cls: 'ai-api-settings-container' });
    this.showSpecificAPISettings(settingsContainer);
  }

  createAPITypeSelector(container) {
    const row = container.createDiv({ cls: 'ai-api-type-selector' });
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '20px';
    row.style.flexWrap = 'wrap';

    const providers = [
      { id: 'openai', name: 'OpenAI', icon: 'cpu' },
      { id: 'gemini', name: 'Gemini', icon: 'sparkles' },
      { id: 'anthropic', name: 'Claude', icon: 'cloud' },
      { id: 'custom', name: 'Custom', icon: 'settings' }
    ];

    providers.forEach(provider => {
      const btn = row.createEl('button', {
        cls: `ai-provider-btn ${this.plugin.settings.cloudApiType === provider.id ? 'active' : ''}`
      });
      
      const iconSpan = btn.createSpan();
      setIcon(iconSpan, provider.icon);
      iconSpan.style.marginRight = '6px';
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.verticalAlign = 'middle';
      
      const textSpan = btn.createSpan();
      textSpan.textContent = provider.name;
      textSpan.style.verticalAlign = 'middle';
      
      btn.style.flex = '1';
      btn.style.minWidth = '120px';
      btn.style.padding = '12px';
      btn.style.borderRadius = '8px';
      btn.style.border = '2px solid';
      btn.style.background = 'var(--background-secondary)';
      btn.style.color = 'var(--text-normal)';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '600';
      
      if (this.plugin.settings.cloudApiType === provider.id) {
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
      }

      btn.dataset.provider = provider.id;

      btn.addEventListener('click', () => {
        this.plugin.settings.cloudApiType = provider.id;
        
        document.querySelectorAll('.ai-provider-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'var(--background-secondary)';
          b.style.borderWidth = '2px';
        });
        
        btn.classList.add('active');
        btn.style.background = 'var(--background-primary)';
        btn.style.borderWidth = '3px';
        
        this.showSpecificAPISettings(document.querySelector('.ai-api-settings-container'));
      });
    });
  }

  showSpecificAPISettings(container) {
    container.empty();

    switch (this.plugin.settings.cloudApiType) {
      case 'openai':
        this.showOpenAISettings(container);
        break;
      case 'gemini':
        this.showGeminiSettings(container);
        break;
      case 'anthropic':
        this.showAnthropicSettings(container);
        break;
      case 'custom':
        this.showCustomSettings(container);
        break;
    }
  }

  showOpenAISettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cpu');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('OpenAI Configuration'));

    this.createInputField(section, 'API Key:', 'openaiApiKey', 
      this.plugin.settings.openaiApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'openaiModel', 
      this.plugin.settings.openaiModel, 'text', 'gpt-3.5-turbo');
    
    this.createInputField(section, 'Custom Endpoint (optional):', 'openaiEndpoint', 
      this.plugin.settings.openaiEndpoint, 'text', 'https://api.openai.com/v1/chat/completions');
    
    const testBtn = section.createEl('button', { cls: 'ai-test-btn' });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'refresh-cw');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    const testText = testBtn.createSpan();
    testText.textContent = 'Test Connection';
    testText.style.verticalAlign = 'middle';
    
    testBtn.style.width = '100%';
    testBtn.style.padding = '12px';
    testBtn.style.borderRadius = '8px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--background-secondary)';
    testBtn.style.color = 'var(--text-normal)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '14px';
    testBtn.style.marginTop = '10px';
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      const provider = new OpenAIProvider(this.plugin);
      const health = await provider.checkHealth();
      new Notice(health.message);
      testBtn.disabled = false;
      testBtn.empty();
      const icon = testBtn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight = '6px';
      icon.style.display = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      const text = testBtn.createSpan();
      text.textContent = 'Test Connection';
      text.style.verticalAlign = 'middle';
    });
  }
  
  showGeminiSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'sparkles');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Google Gemini Configuration (Non-Streaming)'));
    
    this.createInputField(section, 'API Key:', 'geminiApiKey', 
      this.plugin.settings.geminiApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'geminiModel', 
      this.plugin.settings.geminiModel, 'text', 'gemini-1.5-flash');
    
    const testBtn = section.createEl('button', { cls: 'ai-test-btn' });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'refresh-cw');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    const testText = testBtn.createSpan();
    testText.textContent = 'Test Connection';
    testText.style.verticalAlign = 'middle';
    
    testBtn.style.width = '100%';
    testBtn.style.padding = '12px';
    testBtn.style.borderRadius = '8px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--background-secondary)';
    testBtn.style.color = 'var(--text-normal)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '14px';
    testBtn.style.marginTop = '10px';
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      
      const provider = new GeminiProvider(this.plugin);
      const health = await provider.checkHealth();
      new Notice(health.message);
      
      testBtn.disabled = false;
      testBtn.empty();
      const icon = testBtn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight = '6px';
      icon.style.display = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      const text = testBtn.createSpan();
      text.textContent = 'Test Connection';
      text.style.verticalAlign = 'middle';
    });
  }

  showAnthropicSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'cloud');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Anthropic Claude Configuration'));

    this.createInputField(section, 'API Key:', 'anthropicApiKey', 
      this.plugin.settings.anthropicApiKey, 'password');
    
    this.createInputField(section, 'Model:', 'anthropicModel', 
      this.plugin.settings.anthropicModel, 'text', 'claude-3-haiku-20240307');
    
    const testBtn = section.createEl('button', { cls: 'ai-test-btn' });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'refresh-cw');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    const testText = testBtn.createSpan();
    testText.textContent = 'Test Connection';
    testText.style.verticalAlign = 'middle';
    
    testBtn.style.width = '100%';
    testBtn.style.padding = '12px';
    testBtn.style.borderRadius = '8px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--background-secondary)';
    testBtn.style.color = 'var(--text-normal)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '14px';
    testBtn.style.marginTop = '10px';
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      const provider = new AnthropicProvider(this.plugin);
      const health = await provider.checkHealth();
      new Notice(health.message);
      testBtn.disabled = false;
      testBtn.empty();
      const icon = testBtn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight = '6px';
      icon.style.display = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      const text = testBtn.createSpan();
      text.textContent = 'Test Connection';
      text.style.verticalAlign = 'middle';
    });
  }

  showCustomSettings(container) {
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Custom API Configuration'));

    this.createInputField(section, 'API Key:', 'customApiKey', this.plugin.settings.customApiKey, 'password');
    this.createInputField(section, 'Model Name:', 'customModel', this.plugin.settings.customModel, 'text');
    this.createInputField(section, 'Endpoint URL:', 'customEndpoint', this.plugin.settings.customEndpoint, 'text');
    
    const row = section.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    row.createEl('label', { text: 'HTTP Headers (JSON):' }).style.display = 'block';
    
    const headersText = row.createEl('textarea', {
      text: this.plugin.settings.customHeaders || '{}',
      rows: 3
    });
    headersText.style.width = '100%';
    headersText.style.padding = '10px 14px';
    headersText.style.borderRadius = '8px';
    headersText.style.border = '1px solid var(--background-modifier-border)';
    headersText.style.backgroundColor = 'var(--background-primary)';
    headersText.style.color = 'var(--text-normal)';
    headersText.style.fontSize = '14px';
    headersText.style.fontFamily = 'monospace';
    headersText.addEventListener('change', (e) => {
      this.plugin.settings.customHeaders = e.target.value;
    });

    const row2 = section.createDiv({ cls: 'ai-settings-row' });
    row2.style.marginBottom = '16px';
    
    row2.createEl('label', { text: 'Body Template (JSON):' }).style.display = 'block';
    
    const templateText = row2.createEl('textarea', {
      text: this.plugin.settings.customBodyTemplate || '{"messages": {{messages}}, "model": "{{model}}"}',
      rows: 4
    });
    templateText.style.width = '100%';
    templateText.style.padding = '10px 14px';
    templateText.style.borderRadius = '8px';
    templateText.style.border = '1px solid var(--background-modifier-border)';
    templateText.style.backgroundColor = 'var(--background-primary)';
    templateText.style.color = 'var(--text-normal)';
    templateText.style.fontSize = '14px';
    templateText.style.fontFamily = 'monospace';
    templateText.addEventListener('change', (e) => {
      this.plugin.settings.customBodyTemplate = e.target.value;
    });

    const testBtn = section.createEl('button', { cls: 'ai-test-btn' });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, 'refresh-cw');
    testIcon.style.marginRight = '6px';
    testIcon.style.display = 'inline-flex';
    testIcon.style.verticalAlign = 'middle';
    const testText = testBtn.createSpan();
    testText.textContent = 'Test Connection';
    testText.style.verticalAlign = 'middle';
    
    testBtn.style.width = '100%';
    testBtn.style.padding = '12px';
    testBtn.style.borderRadius = '8px';
    testBtn.style.border = '1px solid var(--background-modifier-border)';
    testBtn.style.background = 'var(--background-secondary)';
    testBtn.style.color = 'var(--text-normal)';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '14px';
    testBtn.style.marginTop = '10px';
    
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      const provider = new CustomProvider(this.plugin);
      const health = await provider.checkHealth();
      new Notice(health.message);
      testBtn.disabled = false;
      testBtn.empty();
      const icon = testBtn.createSpan();
      setIcon(icon, 'refresh-cw');
      icon.style.marginRight = '6px';
      icon.style.display = 'inline-flex';
      icon.style.verticalAlign = 'middle';
      const text = testBtn.createSpan();
      text.textContent = 'Test Connection';
      text.style.verticalAlign = 'middle';
    });
  }

  showGeneralSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'settings');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('General Settings'));
    
    this.createSliderField(section, 'Temperature:', 'temperature', this.plugin.settings.temperature, 0, 2, 0.1);
    this.createInputField(section, 'Max Tokens:', 'max_tokens', this.plugin.settings.max_tokens, 'number', '2048');
    this.createInputField(section, 'Conversations Folder:', 'conversationsFolder', this.plugin.settings.conversationsFolder, 'text', 'AI Conversations');
    this.createInputField(section, 'Timeout (ms):', 'timeoutMs', this.plugin.settings.timeoutMs, 'number', '120000');
    this.createCheckboxField(section, 'Auto-check health on startup:', 'autoCheckHealth', this.plugin.settings.autoCheckHealth);
    this.createCheckboxField(section, 'Show token counter:', 'showTokenCounter', this.plugin.settings.showTokenCounter);
    this.createInputPositionSelector(section);
  }

  showShortcutsSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'command');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Keyboard Shortcuts'));
    
    this.createShortcutField(section, 'New Conversation:', 'shortcuts', 'newConversation', this.plugin.settings.shortcuts.newConversation);
    this.createShortcutField(section, 'Save Conversation:', 'shortcuts', 'saveConversation', this.plugin.settings.shortcuts.saveConversation);
    this.createShortcutField(section, 'Rename Conversation:', 'shortcuts', 'renameConversation', this.plugin.settings.shortcuts.renameConversation || 'Ctrl+Shift+R');
    this.createShortcutField(section, 'Open Settings:', 'shortcuts', 'settings', this.plugin.settings.shortcuts.settings);
    this.createShortcutField(section, 'Ask Selection:', 'shortcuts', 'askSelection', this.plugin.settings.shortcuts.askSelection || 'Ctrl+Shift+A');
    this.createShortcutField(section, 'Edit Selection:', 'shortcuts', 'editSelection', this.plugin.settings.shortcuts.editSelection || 'Ctrl+Shift+E');
    
    const info = section.createDiv({ cls: 'ai-shortcuts-info' });
    info.style.background = 'var(--background-primary)';
    info.style.borderRadius = '8px';
    info.style.padding = '12px';
    info.style.marginTop = '16px';
    info.style.border = '1px solid var(--background-modifier-border)';
    info.style.fontSize = '12px';
    info.style.color = 'var(--text-muted)';
    
    info.innerHTML = '<p><strong>Note:</strong> Use Ctrl for Windows/Linux, Cmd for Mac. Examples: Ctrl+Shift+N, Cmd+Shift+N</p>';
  }

  showNamingSettings(container) {
    container.empty();
    
    const section = container.createDiv({ cls: 'ai-settings-section' });
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '8px';
    section.style.padding = '20px';
    section.style.marginBottom = '20px';
    section.style.border = '1px solid var(--background-modifier-border)';
    
    const h3 = section.createEl('h3');
    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    const h3Icon = h3.createSpan();
    setIcon(h3Icon, 'type');
    h3Icon.style.marginRight = '8px';
    h3.appendChild(document.createTextNode('Auto-Naming Settings'));
    
    // Auto-naming toggle
    this.createCheckboxField(section, 'Enable auto-naming of conversations', 'autoNameConversations', this.plugin.settings.autoNameConversations);
    
    // Naming prompt template
    const promptSection = section.createDiv({ cls: 'ai-settings-subsection' });
    promptSection.style.marginTop = '20px';
    promptSection.style.padding = '16px';
    promptSection.style.background = 'var(--background-primary)';
    promptSection.style.borderRadius = '8px';
    promptSection.style.border = '1px solid var(--background-modifier-border)';
    
    const promptLabel = promptSection.createEl('label', { 
      text: 'Naming Prompt Template:',
      cls: 'ai-settings-label'
    });
    promptLabel.style.display = 'block';
    promptLabel.style.marginBottom = '8px';
    promptLabel.style.fontWeight = '600';
    
    const promptDesc = promptSection.createEl('div', {
      text: 'This prompt is used to generate conversation names. {{message}} will be replaced with the first user message.',
      cls: 'ai-settings-description'
    });
    promptDesc.style.fontSize = '12px';
    promptDesc.style.color = 'var(--text-muted)';
    promptDesc.style.marginBottom = '12px';
    
    const promptTemplate = promptSection.createEl('textarea', {
      text: this.plugin.settings.namingPromptTemplate || 'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text.\n\nFirst message: "{{message}}"\n\nConversation title:',
      rows: 6,
      cls: 'ai-naming-prompt-template'
    });
    promptTemplate.style.width = '100%';
    promptTemplate.style.padding = '12px';
    promptTemplate.style.borderRadius = '8px';
    promptTemplate.style.border = '1px solid var(--background-modifier-border)';
    promptTemplate.style.backgroundColor = 'var(--background-primary)';
    promptTemplate.style.color = 'var(--text-normal)';
    promptTemplate.style.fontSize = '13px';
    promptTemplate.style.fontFamily = 'monospace';
    promptTemplate.style.resize = 'vertical';
    
    promptTemplate.addEventListener('change', (e) => {
      this.plugin.settings.namingPromptTemplate = e.target.value;
    });
    
    // Temperature for naming
    this.createSliderField(section, 'Naming Temperature (lower = more consistent):', 'namingTemperature', 
      this.plugin.settings.namingTemperature || 0.3, 0, 1, 0.1);
    
    // Max tokens for naming
    this.createInputField(section, 'Max Tokens for Naming:', 'namingMaxTokens', 
      this.plugin.settings.namingMaxTokens || 30, 'number', '30');
    
    // Naming timeout
    this.createInputField(section, 'Naming Timeout (ms):', 'namingTimeoutMs', 
      this.plugin.settings.namingTimeoutMs || 10000, 'number', '10000');
    
    // Preview section
    const previewSection = section.createDiv({ cls: 'ai-settings-subsection' });
    previewSection.style.marginTop = '20px';
    previewSection.style.padding = '16px';
    previewSection.style.background = 'var(--background-primary)';
    previewSection.style.borderRadius = '8px';
    previewSection.style.border = '1px solid var(--background-modifier-border)';
    
    const previewLabel = previewSection.createEl('div', { 
      text: 'Preview:',
      cls: 'ai-settings-label'
    });
    previewLabel.style.fontWeight = '600';
    previewLabel.style.marginBottom = '8px';
    
    const previewInput = previewSection.createEl('input', {
      type: 'text',
      placeholder: 'Enter a sample message to test naming...',
      cls: 'ai-naming-preview-input'
    });
    previewInput.style.width = '100%';
    previewInput.style.padding = '10px 14px';
    previewInput.style.borderRadius = '8px';
    previewInput.style.border = '1px solid var(--background-modifier-border)';
    previewInput.style.backgroundColor = 'var(--background-secondary)';
    previewInput.style.color = 'var(--text-normal)';
    previewInput.style.fontSize = '14px';
    previewInput.style.marginBottom = '10px';
    
    const previewBtn = previewSection.createEl('button', { cls: 'ai-preview-btn' });
    const previewIcon = previewBtn.createSpan();
    setIcon(previewIcon, 'play');
    previewIcon.style.marginRight = '6px';
    previewIcon.style.display = 'inline-flex';
    previewIcon.style.verticalAlign = 'middle';
    const previewText = previewBtn.createSpan();
    previewText.textContent = 'Test Naming';
    previewText.style.verticalAlign = 'middle';
    
    previewBtn.style.padding = '8px 16px';
    previewBtn.style.borderRadius = '6px';
    previewBtn.style.border = '1px solid var(--background-modifier-border)';
    previewBtn.style.background = 'var(--interactive-accent)';
    previewBtn.style.color = 'var(--text-on-accent)';
    previewBtn.style.cursor = 'pointer';
    previewBtn.style.fontSize = '13px';
    previewBtn.style.marginRight = '10px';
    
    const previewResult = previewSection.createDiv({ cls: 'ai-preview-result' });
    previewResult.style.marginTop = '12px';
    previewResult.style.padding = '12px';
    previewResult.style.borderRadius = '6px';
    previewResult.style.background = 'var(--background-secondary)';
    previewResult.style.border = '1px solid var(--background-modifier-border)';
    previewResult.style.fontSize = '14px';
    previewResult.style.minHeight = '40px';
    previewResult.style.display = 'none';
    
    previewBtn.addEventListener('click', async () => {
      const testMessage = previewInput.value.trim();
      if (!testMessage) {
        new Notice('Please enter a test message');
        return;
      }
      
      previewBtn.disabled = true;
      previewBtn.style.opacity = '0.5';
      previewResult.style.display = 'block';
      previewResult.textContent = 'Generating...';
      
      try {
        // Create a temporary provider for testing
        const provider = this.plugin.apiManager.providers[this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType];
        
        const prompt = (this.plugin.settings.namingPromptTemplate || 
          'Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text.\n\nFirst message: "{{message}}"\n\nConversation title:')
          .replace('{{message}}', testMessage);
        
        const result = await provider.send({
          messages: [{ role: 'user', content: prompt }],
          temperature: this.plugin.settings.namingTemperature || 0.3,
          max_tokens: this.plugin.settings.namingMaxTokens || 30,
          stream: false
        }, {
          timeoutMs: this.plugin.settings.namingTimeoutMs || 10000
        });
        
        if (result && result.final) {
          let title = result.final.trim();
          title = title.replace(/^["']|["']$/g, '');
          title = title.replace(/[.!?]$/, '');
          previewResult.textContent = `Generated name: "${title}"`;
        } else {
          previewResult.textContent = 'Failed to generate name';
        }
      } catch (error) {
        previewResult.textContent = `Error: ${error.message}`;
      } finally {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
      }
    });
  }

  showConversationsSettings(container) {
  container.empty();
  
  const section = container.createDiv({ cls: 'ai-settings-section' });
  section.style.background = 'var(--background-secondary)';
  section.style.borderRadius = '8px';
  section.style.padding = '20px';
  section.style.marginBottom = '20px';
  section.style.border = '1px solid var(--background-modifier-border)';
  
  const h3 = section.createEl('h3');
  h3.style.display = 'flex';
  h3.style.alignItems = 'center';
  const h3Icon = h3.createSpan();
  setIcon(h3Icon, 'message-square');
  h3Icon.style.marginRight = '8px';
  h3.appendChild(document.createTextNode('Conversation Management'));
  
  // Stats summary
  const allSessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
  const needsNaming = this.plugin._sessionManager.getSessionsNeedingNaming();
  
  const statsRow = section.createDiv({ cls: 'ai-stats-row' });
  statsRow.style.display = 'flex';
  statsRow.style.alignItems = 'center';
  statsRow.style.justifyContent = 'space-between';
  statsRow.style.marginBottom = '20px';
  statsRow.style.padding = '12px';
  statsRow.style.background = 'var(--background-primary)';
  statsRow.style.borderRadius = '8px';
  statsRow.style.border = '1px solid var(--background-modifier-border)';
  
  const statsText = statsRow.createDiv({ cls: 'ai-stats-text' });
  statsText.style.display = 'flex';
  statsText.style.gap = '20px';
  
  const totalStat = statsText.createDiv({ cls: 'ai-stat' });
  totalStat.innerHTML = `<strong>Total:</strong> ${allSessions.length}`;
  totalStat.style.fontSize = '14px';
  
  const namingStat = statsText.createDiv({ cls: 'ai-stat' });
  namingStat.innerHTML = `<strong>Need Naming:</strong> ${needsNaming.length}`;
  namingStat.style.fontSize = '14px';
  
  // Optional Name All button (only shows if there are conversations needing naming)
  if (needsNaming.length > 0) {
    const nameAllBtn = statsRow.createEl('button', { cls: 'ai-name-all-btn' });
    const nameIcon = nameAllBtn.createSpan();
    setIcon(nameIcon, 'type');
    nameIcon.style.marginRight = '4px';
    const nameText = nameAllBtn.createSpan();
    nameText.textContent = 'Name All';
    
    nameAllBtn.style.padding = '6px 12px';
    nameAllBtn.style.borderRadius = '6px';
    nameAllBtn.style.border = 'none';
    nameAllBtn.style.background = 'var(--interactive-accent)';
    nameAllBtn.style.color = 'var(--text-on-accent)';
    nameAllBtn.style.cursor = 'pointer';
    nameAllBtn.style.fontSize = '12px';
    nameAllBtn.style.display = 'flex';
    nameAllBtn.style.alignItems = 'center';
    
    nameAllBtn.addEventListener('click', async () => {
      nameAllBtn.disabled = true;
      nameAllBtn.style.opacity = '0.5';
      
      let named = 0;
      let failed = 0;
      
      for (const session of needsNaming) {
        if (session.messages.length > 0) {
          const firstUserMessage = session.messages.find(m => m.role === 'user');
          if (firstUserMessage) {
            try {
              const generatedName = await this.plugin.generateConversationName(firstUserMessage.content);
              if (generatedName) {
                session.name = generatedName;
                session.needsNaming = false;
                named++;
              } else {
                failed++;
              }
            } catch (error) {
              failed++;
            }
          }
        }
      }
      
      if (named > 0) {
        this.plugin.saveState();
        this.showConversationsSettings(container);
        new Notice(`✓ Named ${named} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
        this.refreshChatViews();
      }
      
      nameAllBtn.disabled = false;
      nameAllBtn.style.opacity = '1';
    });
  }
  
  // Conversation List
  const sessionList = section.createDiv({ cls: 'ai-session-list' });
  sessionList.style.maxHeight = '300px';
  sessionList.style.overflowY = 'auto';
  sessionList.style.border = '1px solid var(--background-modifier-border)';
  sessionList.style.borderRadius = '8px';
  sessionList.style.padding = '8px';
  sessionList.style.marginBottom = '16px';
  sessionList.style.backgroundColor = 'var(--background-primary)';
  
  const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
  
  if (sessions.length === 0) {
    const emptyMsg = sessionList.createDiv({ 
      cls: 'ai-empty-sessions',
      text: 'No conversations yet'
    });
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '40px 20px';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontSize = '14px';
  } else {
    sessions.forEach(session => {
      const sessionRow = sessionList.createDiv({ 
        cls: `ai-session-row ${this.plugin._sessionManager.activeId === session.id ? 'active' : ''}` 
      });
      sessionRow.style.display = 'flex';
      sessionRow.style.justifyContent = 'space-between';
      sessionRow.style.alignItems = 'center';
      sessionRow.style.padding = '10px 12px';
      sessionRow.style.borderRadius = '6px';
      sessionRow.style.marginBottom = '6px';
      sessionRow.style.backgroundColor = 'var(--background-secondary)';
      sessionRow.style.border = '1px solid var(--background-modifier-border)';
      
      if (this.plugin._sessionManager.activeId === session.id) {
        sessionRow.style.backgroundColor = 'rgba(var(--interactive-accent-rgb), 0.1)';
        sessionRow.style.borderColor = 'var(--interactive-accent)';
      }
      
      // Session info
      const sessionInfo = sessionRow.createDiv({ cls: 'ai-session-info' });
      sessionInfo.style.flex = '1';
      sessionInfo.style.minWidth = '0';
      
      const nameSpan = sessionInfo.createEl('div', { cls: 'ai-session-name' });
      nameSpan.textContent = session.name;
      nameSpan.style.fontWeight = '600';
      nameSpan.style.fontSize = '14px';
      nameSpan.style.color = 'var(--text-normal)';
      nameSpan.style.marginBottom = '2px';
      nameSpan.style.whiteSpace = 'nowrap';
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      
      const messageCount = sessionInfo.createEl('div', { 
        cls: 'ai-session-count',
        text: `${session.messages.length} message${session.messages.length !== 1 ? 's' : ''}` 
      });
      messageCount.style.fontSize = '12px';
      messageCount.style.color = 'var(--text-muted)';
      
      // Session actions
      const sessionActions = sessionRow.createDiv({ cls: 'ai-session-actions' });
      sessionActions.style.display = 'flex';
      sessionActions.style.gap = '6px';
      sessionActions.style.flexShrink = '0';
      
      // Copy button
      const duplicateBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn duplicate' });
      const duplicateIcon = duplicateBtn.createSpan();
      duplicateIcon.style.marginRight = '4px';
      duplicateIcon.style.display = 'inline-flex';
      duplicateIcon.style.verticalAlign = 'middle';
      const duplicateText = duplicateBtn.createSpan();
      duplicateText.textContent = 'duplicate';
      duplicateText.style.verticalAlign = 'middle';
      
      duplicateBtn.style.padding = '4px 8px';
      duplicateBtn.style.borderRadius = '4px';
      duplicateBtn.style.border = '1px solid var(--background-modifier-border)';
      duplicateBtn.style.backgroundColor = 'var(--background-secondary)';
      duplicateBtn.style.color = 'var(--text-normal)';
      duplicateBtn.style.cursor = 'pointer';
      duplicateBtn.style.fontSize = '11px';
      
      duplicateBtn.addEventListener('click', () => {
        const newName = prompt('Name for copied conversation:', `${session.name} (Copy)`);
        if (newName && newName.trim()) {
          const duplicate = this.plugin._sessionManager.duplicate(session.id, newName.trim());
          if (duplicate) {
            this.plugin.saveState();
            this.showConversationsSettings(container);
            new Notice(`✓ Copied to: ${duplicate.name}`);
            this.refreshChatViews();
          }
        }
      });
      
      // Activate button
      const switchBtn = sessionActions.createEl('button', {
        text: 'Activate',
        cls: 'ai-session-action-btn'
      });
      switchBtn.style.padding = '4px 8px';
      switchBtn.style.borderRadius = '4px';
      switchBtn.style.border = '1px solid var(--background-modifier-border)';
      switchBtn.style.backgroundColor = 'var(--background-secondary)';
      switchBtn.style.color = 'var(--text-normal)';
      switchBtn.style.cursor = 'pointer';
      switchBtn.style.fontSize = '11px';
      
      switchBtn.addEventListener('click', () => {
        this.plugin._sessionManager.switchTo(session.id);
        this.plugin.saveState();
        this.showConversationsSettings(container);
        new Notice(`Switched to conversation: ${session.name}`);
        this.refreshChatViews();
      });
      
      // Delete button
      const deleteBtn = sessionActions.createEl('button', {
        text: 'Delete',
        cls: 'ai-session-action-btn delete'
      });
      deleteBtn.style.padding = '4px 8px';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.border = '1px solid var(--text-error)';
      deleteBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
      deleteBtn.style.color = 'var(--text-error)';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '11px';
      
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete conversation "${session.name}"?`)) {
          this.plugin._sessionManager.delete(session.id);
          this.plugin.saveState();
          this.showConversationsSettings(container);
          new Notice('Conversation deleted');
          this.refreshChatViews();
        }
      });
    
      // Save button
      const saveBtn = sessionActions.createEl('button', { cls: 'ai-session-action-btn save' });
      const saveIcon = saveBtn.createSpan();
      setIcon(saveIcon, 'save');
      saveIcon.style.marginRight = '4px';
      saveIcon.style.display = 'inline-flex';
      saveIcon.style.verticalAlign = 'middle';
      const saveText = saveBtn.createSpan();
      saveText.textContent = 'Save';
      saveText.style.verticalAlign = 'middle';
      
      saveBtn.style.padding = '4px 8px';
      saveBtn.style.borderRadius = '4px';
      saveBtn.style.border = '1px solid #2e7d32';
      saveBtn.style.backgroundColor = 'rgba(46, 125, 50, 0.1)';
      saveBtn.style.color = '#2e7d32';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.fontSize = '11px';
      
      saveBtn.addEventListener('click', async () => {
        await this.saveConversationToFile(session);
      });
      
    });
  }
  
  // New conversation section
  const newSessionSection = section.createDiv({ cls: 'ai-new-session-section' });
  newSessionSection.style.display = 'flex';
  newSessionSection.style.gap = '10px';
  newSessionSection.style.marginBottom = '16px';
  
  const newSessionInput = newSessionSection.createEl('input', {
    type: 'text',
    placeholder: 'New conversation name (leave empty for auto-name)',
    cls: 'ai-new-session-input'
  });
  newSessionInput.style.flex = '1';
  newSessionInput.style.padding = '10px 14px';
  newSessionInput.style.borderRadius = '8px';
  newSessionInput.style.border = '1px solid var(--background-modifier-border)';
  newSessionInput.style.backgroundColor = 'var(--background-primary)';
  newSessionInput.style.color = 'var(--text-normal)';
  newSessionInput.style.fontSize = '14px';
  
  const newSessionBtn = newSessionSection.createEl('button', { cls: 'ai-new-session-btn' });
  const newIcon = newSessionBtn.createSpan();
  setIcon(newIcon, 'plus');
  newIcon.style.marginRight = '6px';
  newIcon.style.display = 'inline-flex';
  newIcon.style.verticalAlign = 'middle';
  const newText = newSessionBtn.createSpan();
  newText.textContent = 'New Conversation';
  newText.style.verticalAlign = 'middle';
  
  newSessionBtn.style.padding = '10px 16px';
  newSessionBtn.style.borderRadius = '8px';
  newSessionBtn.style.border = '1px solid var(--background-modifier-border)';
  newSessionBtn.style.backgroundColor = 'var(--interactive-accent)';
  newSessionBtn.style.color = 'var(--text-on-accent)';
  newSessionBtn.style.cursor = 'pointer';
  newSessionBtn.style.fontSize = '14px';
  
  newSessionBtn.addEventListener('click', () => {
    const name = newSessionInput.value.trim();
    
    if (name) {
      // User provided a name
      this.plugin._sessionManager.create(name);
      this.plugin.saveState();
      new Notice(`✓ Created conversation: ${name}`);
    } else {
      // User left it empty, create with default name
      const session = this.plugin._sessionManager.create('New Conversation', '', true);
      this.plugin.saveState();
      
      if (this.plugin.settings.autoNameConversations) {
        new Notice('Conversation created - will be auto-named after first message');
      } else {
        new Notice('✓ Created new conversation');
      }
    }
    
    this.showConversationsSettings(container);
    newSessionInput.value = '';
    this.refreshChatViews();
  });
  
  // Bottom buttons row
  const bottomButtonsRow = section.createDiv({ cls: 'ai-bottom-buttons-row' });
  bottomButtonsRow.style.display = 'flex';
  bottomButtonsRow.style.gap = '10px';
  bottomButtonsRow.style.marginTop = '16px';
  
  // Delete All button
  const clearAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-clear-all-btn' });
  const clearIcon = clearAllBtn.createSpan();
  setIcon(clearIcon, 'trash-2');
  clearIcon.style.marginRight = '6px';
  clearIcon.style.display = 'inline-flex';
  clearIcon.style.verticalAlign = 'middle';
  const clearText = clearAllBtn.createSpan();
  clearText.textContent = 'Delete All Conversations';
  clearText.style.verticalAlign = 'middle';
  
  clearAllBtn.style.flex = '1';
  clearAllBtn.style.padding = '12px';
  clearAllBtn.style.borderRadius = '8px';
  clearAllBtn.style.border = '1px solid var(--text-error)';
  clearAllBtn.style.backgroundColor = 'rgba(var(--background-modifier-error-rgb), 0.1)';
  clearAllBtn.style.color = 'var(--text-error)';
  clearAllBtn.style.cursor = 'pointer';
  clearAllBtn.style.fontSize = '14px';
  
  clearAllBtn.addEventListener('click', () => {
    if (confirm('Delete ALL conversations? This cannot be undone.')) {
      this.plugin._sessionManager.sessions = [];
      this.plugin._sessionManager.create('Default Conversation');
      this.plugin.saveState();
      this.showConversationsSettings(container);
      new Notice('All conversations deleted');
      this.refreshChatViews();
    }
  });
  
  // Export All button
  const exportAllBtn = bottomButtonsRow.createEl('button', { cls: 'ai-export-all-btn' });
  const exportIcon = exportAllBtn.createSpan();
  setIcon(exportIcon, 'download');
  exportIcon.style.marginRight = '6px';
  exportIcon.style.display = 'inline-flex';
  exportIcon.style.verticalAlign = 'middle';
  const exportText = exportAllBtn.createSpan();
  exportText.textContent = 'Export All';
  exportText.style.verticalAlign = 'middle';
  
  exportAllBtn.style.flex = '1';
  exportAllBtn.style.padding = '12px';
  exportAllBtn.style.borderRadius = '8px';
  exportAllBtn.style.border = '1px solid var(--background-modifier-border)';
  exportAllBtn.style.backgroundColor = 'var(--background-secondary)';
  exportAllBtn.style.color = 'var(--text-normal)';
  exportAllBtn.style.cursor = 'pointer';
  exportAllBtn.style.fontSize = '14px';
  
  exportAllBtn.addEventListener('click', async () => {
    const sessions = this.plugin._sessionManager.getAllSessions({ excludeTemporary: true });
    if (sessions.length === 0) {
      new Notice('No conversations to export');
      return;
    }
    
    exportAllBtn.disabled = true;
    exportAllBtn.style.opacity = '0.5';
    
    let exported = 0;
    let failed = 0;
    
    for (const session of sessions) {
      try {
        const content = this.plugin._sessionManager.exportToMarkdown(session);
        const folderPath = this.plugin.settings.conversationsFolder || 'AI Conversations';
        const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
        
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
          await this.app.vault.createFolder(folderPath);
        }
        
        const fullPath = await this.plugin.getUniqueFilePath(folderPath, baseName, 'md');
        await this.app.vault.create(fullPath, content);
        exported++;
      } catch (error) {
        console.error('Error exporting conversation:', error);
        failed++;
      }
    }
    
    new Notice(`✓ Exported ${exported} conversations${failed > 0 ? `, ${failed} failed` : ''}`);
    
    exportAllBtn.disabled = false;
    exportAllBtn.style.opacity = '1';
  });
}

  async saveConversationToFile(session) {
    try {
        const content = this.plugin._sessionManager.exportToMarkdown(session);
        const folderPath = this.plugin.settings.conversationsFolder || 'AI Conversations';
        const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
        
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
            await this.app.vault.createFolder(folderPath);
        }
        
        const fullPath = await this.plugin.getUniqueFilePath(folderPath, baseName, 'md');
        
        await this.app.vault.create(fullPath, content);
        new Notice(`✓ Conversation saved to: ${fullPath}`);
    } catch (error) {
        console.error('Error saving conversation:', error);
        new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }

  refreshChatViews() {
    this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
      if (leaf.view instanceof ChatView) {
        leaf.view._renderMessages();
        leaf.view.updateTokenCounterVisibility();
      }
    });
  }
  
  createInputField(container, label, key, value, type = 'text', placeholder = '') {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    row.createEl('label', { text: label }).style.display = 'block';
    
    const input = row.createEl('input', {
      type: type,
      value: value,
      placeholder: placeholder
    });
    input.style.width = '100%';
    input.style.padding = '10px 14px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.backgroundColor = 'var(--background-primary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    
    input.addEventListener('change', (e) => {
      this.plugin.settings[key] = type === 'number' ? parseInt(e.target.value) : e.target.value;
    });
    
    return input;
  }

  createShortcutField(container, label, parentKey, shortcutKey, value) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    row.createEl('label', { text: label }).style.display = 'block';
    
    const input = row.createEl('input', {
      type: 'text',
      value: value,
      placeholder: 'Example: Ctrl+Shift+N'
    });
    input.style.width = '100%';
    input.style.padding = '10px 14px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.backgroundColor = 'var(--background-primary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.boxSizing = 'border-box';
    
    input.addEventListener('change', (e) => {
      this.plugin.settings[parentKey][shortcutKey] = e.target.value;
    });
    
    return input;
  }
  
  createSliderField(container, label, key, value, min, max, step) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    
    const labelRow = row.createDiv({ style: 'display: flex; justify-content: space-between;' });
    labelRow.createEl('label', { text: label });
    const valueSpan = labelRow.createEl('span', { text: value, cls: 'ai-slider-value' });
    valueSpan.style.fontWeight = '600';
    valueSpan.style.color = 'var(--interactive-accent)';
    
    const slider = row.createEl('input', {
      type: 'range',
      value: value,
      min: min,
      max: max,
      step: step
    });
    slider.style.width = '100%';
    slider.style.height = '6px';
    slider.style.borderRadius = '3px';
    slider.style.background = 'var(--background-modifier-border)';
    
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.plugin.settings[key] = val;
      valueSpan.textContent = val.toFixed(1);
    });
    
    return slider;
  }
  
  createCheckboxField(container, label, key, checked) {
    const row = container.createDiv({ cls: 'ai-settings-row checkbox' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.marginBottom = '16px';
    
    const checkbox = row.createEl('input', {
      type: 'checkbox',
      checked: checked
    });
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.accentColor = 'var(--interactive-accent)';
    
    checkbox.addEventListener('change', (e) => {
      this.plugin.settings[key] = e.target.checked;
    });
    
    row.createEl('label', { text: label }).style.cursor = 'pointer';
    row.prepend(checkbox);
    
    return checkbox;
  }
  
  createInputPositionSelector(container) {
    const row = container.createDiv({ cls: 'ai-settings-row' });
    row.style.marginBottom = '16px';
    row.style.padding = '12px';
    row.style.background = 'var(--background-primary)';
    row.style.borderRadius = '8px';
    row.style.border = '1px solid var(--background-modifier-border)';
    
    const label = row.createEl('label', { text: 'Input Field Position:' });
    label.style.display = 'block';
    label.style.marginBottom = '8px';
    label.style.fontWeight = '600';
    
    const optionsRow = row.createDiv({ style: 'display: flex; gap: 20px;' });
    
    // Bottom option (default)
    const bottomOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const bottomRadio = bottomOption.createEl('input', {
      type: 'radio',
      name: 'inputPosition',
      value: 'bottom',
      attr: { id: 'input-bottom' }
    });
    bottomRadio.checked = this.plugin.settings.inputPosition === 'bottom';
    bottomRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.plugin.settings.inputPosition = 'bottom';
      }
    });
    
    const bottomLabel = bottomOption.createEl('label', { 
      text: 'Bottom',
      attr: { for: 'input-bottom' }
    });
    bottomLabel.style.cursor = 'pointer';
    
    // Top option
    const topOption = optionsRow.createDiv({ style: 'display: flex; align-items: center; gap: 6px;' });
    const topRadio = topOption.createEl('input', {
      type: 'radio',
      name: 'inputPosition',
      value: 'top',
      attr: { id: 'input-top' }
    });
    topRadio.checked = this.plugin.settings.inputPosition === 'top';
    topRadio.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.plugin.settings.inputPosition = 'top';
      }
    });
    
    const topLabel = topOption.createEl('label', { 
      text: 'Top',
      attr: { for: 'input-top' }
    });
    topLabel.style.cursor = 'pointer';
    
    const previewDiv = row.createDiv({ 
      style: 'margin-top: 12px; padding: 8px; background: var(--background-secondary); border-radius: 6px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;' 
    });
    previewDiv.textContent = 'Preview: Input field will appear at the ' + 
      (this.plugin.settings.inputPosition === 'bottom' ? 'bottom' : 'top') + 
      ' of the sidebar';
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// ==================== AI CODE BLOCK PROCESSOR ====================

class AICodeBlockProcessor {
  constructor(plugin) {
    this.plugin = plugin;
    this.activeBlocks = new Map(); // Track active code blocks by ID
  }

  process(source, el, ctx) {
    // Parse the configuration from the code block
    const config = this.parseConfig(source);
    
    // Generate a unique ID for this block instance
    const blockId = `ai-block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create container for the AI interface
    const container = el.createDiv({ cls: 'ai-codeblock-container' });
    container.setAttribute('data-block-id', blockId);
    
    // Initialize cache for this block
    const cache = this.initializeCache(config, blockId, source);
    
    // Get the current file path if available
    let filePath = '';
    try {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file) {
            filePath = view.file.path;
        }
    } catch (e) {
        console.log('Could not get file path');
    }
    
    // Store block data with file reference
    this.activeBlocks.set(blockId, {
        id: blockId,
        config,
        cache,
        currentLoop: this.getCurrentLoopFromCache(cache, config),
        totalLoops: config.repeating === 'Loop' ? Infinity : parseInt(config.repeating) || 1,
        ctx,
        container,
        el,
        filePath,
        source
    });
    
    // Render the UI based on configuration
    this.renderBlock(blockId);
    
    // Return the blockId so the renderer can track it
    return blockId;
    }

  parseConfig(source) {
    const lines = source.split('\n').filter(line => line.trim());
    const config = {
      environment: 'Simple',
      systemPrompt: '',
      model: '',
      repeating: '1',
      moving: 'Arrow',
      memory: 'Current',
      caching: 'Code Block',
      emptyPlaceholder: 'Ask...',
      cachedData: {}
    };

  // Parse cached data if present (handles both old multi-line and new single-line formats)
  const cachedDataMatch = source.match(/cached data:\s*(\{[\s\S]*\})/);
  if (cachedDataMatch && cachedDataMatch[1]) {
    try {
      let jsonStr = cachedDataMatch[1].trim();
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      config.cachedData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse cached data:', e);
      try {
        let fixedJson = cachedDataMatch[1]
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        config.cachedData = JSON.parse(fixedJson);
      } catch (e2) {
        console.error('Still failed to parse cached data:', e2);
      }
    }
  }

  // Parse configuration lines (excluding cached data line)
  lines.forEach(line => {
    if (line.trim().startsWith('cached data:')) return;
    
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    
    switch(key) {
      case 'environment':
        config.environment = value;
        break;
      case 'system prompt':
        config.systemPrompt = value;
        break;
      case 'model':
        config.model = this.parseModel(value);
        break;
      case 'repeating':
        config.repeating = this.parseRepeating(value);
        break;
      case 'moving':
        config.moving = this.parseMoving(value);
        break;
      case 'memory':
        config.memory = this.parseMemory(value);
        break;
      case 'caching':
        config.caching = this.parseCaching(value);
        break;
      case 'ask is empty': // New option for custom placeholder
        config.emptyPlaceholder = value;
        break;
    }
  });

    return config;
  }

  parseModel(value) {
    const lower = value.toLowerCase();
    if (lower.includes('local')) return 'local';
    if (lower.includes('gemini') || lower.includes('google')) return 'gemini';
    if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic';
    if (lower.includes('chatgpt') || lower.includes('openai')) return 'openai';
    if (lower.includes('custom')) return 'custom';
    return value;
  }

  parseRepeating(value) {
    const lower = value.toLowerCase();
    if (lower === 'loop') return 'Loop';
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) return num.toString();
    return '1';
  }

  parseMoving(value) {
    const lower = value.toLowerCase();
    if (lower.includes('arrow')) return 'Arrow';
    if (lower.includes('flow')) return 'Flow';
    return 'Arrow';
  }

  parseMemory(value) {
    const lower = value.toLowerCase();
    if (lower === 'all') return 'All';
    const match = lower.match(/previous\s*\(?(\d+)\)?/);
    if (match) return `Previous (${match[1]})`;
    return 'Current';
  }

  parseCaching(value) {
    const lower = value.toLowerCase();
    if (lower.includes('data.json')) return 'Data.json';
    return 'Code Block';
  }

  parseIOConfig(envString) {
    const match = envString.match(/separate\s+(input|output)\s+(.+)/i);
    if (match) {
      return {
        type: match[1].toLowerCase(),
        id: match[2].trim()
      };
    }
    return { type: 'unknown', id: '' };
  }

  initializeCache(config, blockId, source) {
    if (config.caching === 'Temporary') {
    return this.createNewEmptyCache(config);
  }
    let cache = {};
    
    // Try to parse cached data from the source
    if (source && source.includes('cached data:')) {
      try {
        const match = source.match(/cached data:\s*(\{[\s\S]*\})/);
        if (match && match[1]) {
          let jsonStr = match[1].trim();
          jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
          cache = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error('Failed to parse cached data:', e);
      }
    }
    
    // If no cache found and caching is set to Data.json, try loading from plugin data
    if (Object.keys(cache).length === 0 && config.caching === 'Data.json') {
      const saved = this.plugin.settings.codeBlockCache?.[blockId];
      if (saved) {
        cache = saved;
      }
    }
    
    // If still no cache, initialize based on repeating mode
    if (Object.keys(cache).length === 0) {
      if (config.repeating === 'Loop') {
        cache = { session_log: [] };
      } else {
        const numLoops = parseInt(config.repeating) || 1;
        cache = {};
        for (let i = 1; i <= numLoops; i++) {
          cache[`loop${i}`] = {};
        }
      }
    }
    
    return cache;
  }
  
  createNewEmptyCache(config) {
  if (config.repeating === 'Loop') {
    return { session_log: [] };
  } else {
    const numLoops = parseInt(config.repeating) || 1;
    const cache = {};
    for (let i = 1; i <= numLoops; i++) {
      cache[`loop${i}`] = {};
    }
    return cache;
  }
  }

  getCurrentLoopFromCache(cache, config) {
    if (config.repeating === 'Loop') {
      if (cache.session_log && cache.session_log.length > 0) {
        return cache.session_log.length + 1;
      }
      return 1;
    } else {
      const numLoops = parseInt(config.repeating) || 1;
      for (let i = numLoops; i >= 1; i--) {
        if (cache[`loop${i}`]?.[`res-${i}`]) {
          return i;
        }
      }
      return 1;
    }
  }

  renderBlock(blockId) {
    const block = this.activeBlocks.get(blockId);
    if (!block) return;
    
    const { container, config } = block;
    container.empty();
    
    // Check for separate IO environment first
    const env = config.environment.toLowerCase();
    if (env.startsWith('separate')) {
      this.renderSeparateIOEnvironment(block);
    } else if (env === 'simple') {
      this.renderSimpleEnvironment(block);
    } else if (env === 'full') {
      this.renderFullEnvironment(block);
    } else {
      this.renderSimpleEnvironment(block);
    }
  }

  // ==================== SIMPLE ENVIRONMENT ====================

  renderSimpleEnvironment(block) {
    const { container, config, currentLoop, totalLoops, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.padding = '0';
    container.style.margin = '8px 0';
    container.style.background = 'transparent';

    // Ask Input Area with embedded controls
    this.renderSimpleInput(block);

    // Separator line
    const line = container.createDiv({ cls: 'ai-simple-separator' });
    line.style.borderTop = '1px solid var(--background-modifier-border)';
    line.style.margin = '4px 0';

    // Response Area
    this.renderSimpleResponse(block);
  }

  renderSimpleInput(block) {
    const { container, config, currentLoop, totalLoops, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-simple-input-wrapper' });
    inputContainer.style.position = 'relative';
    inputContainer.style.width = '100%';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-simple-input',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '1'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '20px';
    input.style.paddingRight = '80px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'none';
    input.style.boxSizing = 'border-box';
    
    // Navigation arrows (if multiple loops)
    if (config.repeating !== '1') {
      const prevBtn = inputContainer.createEl('button', { 
        text: '←',
        cls: 'ai-nav-arrow prev',
        attr: { title: 'Previous' }
      });
      prevBtn.style.position = 'absolute';
      prevBtn.style.left = '8px';
      prevBtn.style.top = '45%';
      prevBtn.style.transform = 'translateY(-50%)';
      prevBtn.style.width = '28px';
      prevBtn.style.height = '28px';
      prevBtn.style.borderRadius = '50%';
      prevBtn.style.border = '1px solid var(--background-modifier-border)';
      prevBtn.style.background = 'var(--background-primary)';
      prevBtn.style.color = 'var(--text-normal)';
      prevBtn.style.cursor = 'pointer';
      prevBtn.style.display = 'flex';
      prevBtn.style.alignItems = 'center';
      prevBtn.style.justifyContent = 'center';
      prevBtn.style.fontSize = '16px';
      prevBtn.style.padding = '0';
      prevBtn.style.zIndex = '2';
      prevBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      const nextBtn = inputContainer.createEl('button', { 
        text: '→',
        cls: 'ai-nav-arrow next',
        attr: { title: 'Next' }
      });
      nextBtn.style.position = 'absolute';
      nextBtn.style.right = '48px';
      nextBtn.style.top = '45%';
      nextBtn.style.transform = 'translateY(-50%)';
      nextBtn.style.width = '28px';
      nextBtn.style.height = '28px';
      nextBtn.style.borderRadius = '50%';
      nextBtn.style.border = '1px solid var(--background-modifier-border)';
      nextBtn.style.background = 'var(--background-primary)';
      nextBtn.style.color = 'var(--text-normal)';
      nextBtn.style.cursor = 'pointer';
      nextBtn.style.display = 'flex';
      nextBtn.style.alignItems = 'center';
      nextBtn.style.justifyContent = 'center';
      nextBtn.style.fontSize = '16px';
      nextBtn.style.padding = '0';
      nextBtn.style.zIndex = '2';
      nextBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      prevBtn.disabled = currentLoop <= 1;
      nextBtn.disabled = config.repeating !== 'Loop' && currentLoop >= totalLoops;
      
      prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
      nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
      
      prevBtn.addEventListener('click', () => {
        if (currentLoop > 1) {
          block.currentLoop--;
          this.renderBlock(block.id);
        }
      });
      
      nextBtn.addEventListener('click', () => {
        if (config.repeating === 'Loop' || currentLoop < totalLoops) {
          block.currentLoop++;
          this.renderBlock(block.id);
        }
      });
      
      [prevBtn, nextBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          if (!btn.disabled) {
            btn.style.background = 'var(--interactive-accent)';
            btn.style.color = 'var(--text-on-accent)';
          }
        });
        btn.addEventListener('mouseleave', () => {
          if (!btn.disabled) {
            btn.style.background = 'var(--background-primary)';
            btn.style.color = 'var(--text-normal)';
          }
        });
      });
    }
    
    // Send button
    const sendBtn = inputContainer.createEl('button', { 
      text: '➤',
      cls: 'ai-send-btn',
      attr: { title: 'Send (Shift+Enter)' }
    });
    sendBtn.style.position = 'absolute';
    sendBtn.style.right = '12px';
    sendBtn.style.bottom = '24px';
    sendBtn.style.width = '32px';
    sendBtn.style.height = '32px';
    sendBtn.style.borderRadius = '50%';
    sendBtn.style.border = 'none';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    sendBtn.style.transition = 'transform 0.2s';
    
    sendBtn.addEventListener('mouseenter', () => {
      sendBtn.style.transform = 'scale(1.1)';
    });
    
    sendBtn.addEventListener('mouseleave', () => {
      sendBtn.style.transform = 'scale(1)';
    });
    
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      if (entry) {
        input.value = entry.ask || '';
      }
    } else {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }
    
    sendBtn.addEventListener('click', () => {
      this.handleSimpleInput(block, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleSimpleInput(block, input.value);
      }
    });
  }

  renderSimpleResponse(block) {
    const { container, config, currentLoop, cache } = block;
    
    const responseContainer = container.createDiv({ cls: 'ai-simple-response' });
    responseContainer.style.padding = '12px';
    responseContainer.style.background = 'var(--background-secondary)';
    responseContainer.style.borderRadius = '8px';
    responseContainer.style.minHeight = '60px';
    responseContainer.style.border = '1px solid var(--background-modifier-border)';
    responseContainer.style.fontSize = '14px';
    responseContainer.style.lineHeight = '1.6';
    
    let responseText = '';
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      responseText = entry?.res || '';
    } else {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }
    
    if (responseText) {
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        responseContainer,
        '',
        this.plugin
      );
    } else {
      responseContainer.textContent = '';
    }
  }

  // ==================== SEPARATE IO ENVIRONMENT ====================

  renderSeparateIOEnvironment(block) {
    const { container, config, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.padding = '0';
    container.style.margin = '8px 0';
    container.style.background = 'transparent';

    const ioConfig = this.parseIOConfig(config.environment);
    
    if (ioConfig.type === 'input') {
      this.renderSeparateInput(block, ioConfig.id);
    } else if (ioConfig.type === 'output') {
      this.renderSeparateOutput(block, ioConfig.id);
    }
  }

  renderSeparateInput(block, ioId) {
    const { container, config, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-separate-input' });
    inputContainer.style.position = 'relative';
    inputContainer.style.width = '100%';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-separate-input-field',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '1'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.paddingRight = '48px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'vertical';
    input.style.boxSizing = 'border-box';
    
    if (cache[ioId]?.ask) {
      input.value = cache[ioId].ask;
    }
    
    const sendBtn = inputContainer.createEl('button', { 
      text: '➤',
      cls: 'ai-send-btn',
      attr: { title: 'Send (Shift+Enter)' }
    });
    sendBtn.style.position = 'absolute';
    sendBtn.style.right = '12px';
    sendBtn.style.bottom = '30%';
    sendBtn.style.width = '32px';
    sendBtn.style.height = '32px';
    sendBtn.style.borderRadius = '50%';
    sendBtn.style.border = 'none';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.display = 'flex';
    sendBtn.style.alignItems = 'center';
    sendBtn.style.justifyContent = 'center';
    sendBtn.style.fontSize = '18px';
    sendBtn.style.padding = '0';
    sendBtn.style.zIndex = '2';
    sendBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    
    sendBtn.addEventListener('click', () => {
      this.handleSeparateInput(block, ioId, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleSeparateInput(block, ioId, input.value);
      }
    });
  }

  renderSeparateOutput(block, ioId) {
    const { container, config, cache } = block;
    
    const outputContainer = container.createDiv({ cls: 'ai-separate-output' });
    outputContainer.style.width = '100%';
    
    const responseDiv = outputContainer.createDiv({ cls: 'ai-separate-response' });
    responseDiv.style.padding = '12px';
    responseDiv.style.background = 'var(--background-secondary)';
    responseDiv.style.borderRadius = '8px';
    responseDiv.style.minHeight = '60px';
    responseDiv.style.border = '1px solid var(--background-modifier-border)';
    responseDiv.style.fontSize = '14px';
    responseDiv.style.lineHeight = '1.6';
    
    if (cache[ioId]?.res) {
      MarkdownRenderer.render(
        this.plugin.app,
        cache[ioId].res,
        responseDiv,
        '',
        this.plugin
      );
    } else {
      responseDiv.textContent = '';
    }
  }

  // ==================== FULL ENVIRONMENT ====================

  renderFullEnvironment(block) {
    const { container, config, currentLoop, totalLoops, cache, id } = block;
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';
    container.style.padding = '16px';
    container.style.border = '1px solid var(--background-modifier-border)';
    container.style.borderRadius = '8px';
    container.style.background = 'var(--background-primary)';
    container.style.margin = '8px 0';

    if (config.repeating !== '1' && config.moving === 'Arrow') {
      this.renderFullNavigation(block);
    }

    this.renderFullInput(block);
    this.renderFullResponse(block);
  }

  renderFullNavigation(block) {
    const { container, config, currentLoop, totalLoops } = block;
    
    const navBar = container.createDiv({ cls: 'ai-nav-bar' });
    navBar.style.display = 'flex';
    navBar.style.justifyContent = 'space-between';
    navBar.style.alignItems = 'center';
    navBar.style.padding = '8px';
    navBar.style.background = 'var(--background-secondary)';
    navBar.style.borderRadius = '6px';
    navBar.style.marginBottom = '8px';

    const prevBtn = navBar.createEl('button', { text: '← Previous' });
    const counter = navBar.createSpan({ 
      text: `Loop ${currentLoop} / ${totalLoops === Infinity ? '∞' : totalLoops}` 
    });
    const nextBtn = navBar.createEl('button', { text: 'Next →' });

    [prevBtn, nextBtn].forEach(btn => {
      btn.style.padding = '4px 12px';
      btn.style.borderRadius = '4px';
      btn.style.border = '1px solid var(--background-modifier-border)';
      btn.style.background = 'var(--background-primary)';
      btn.style.cursor = 'pointer';
    });

    prevBtn.disabled = currentLoop <= 1;
    nextBtn.disabled = config.repeating !== 'Loop' && currentLoop >= totalLoops;

    prevBtn.addEventListener('click', () => {
      if (currentLoop > 1) {
        block.currentLoop--;
        this.renderBlock(block.id);
      }
    });

    nextBtn.addEventListener('click', () => {
      if (config.repeating === 'Loop' || currentLoop < totalLoops) {
        block.currentLoop++;
        this.renderBlock(block.id);
      }
    });
  }

  renderFullInput(block) {
    const { container, config, currentLoop, cache } = block;
    
    const inputContainer = container.createDiv({ cls: 'ai-full-input' });
    
    const label = inputContainer.createEl('div', { 
      text: `Ask ${currentLoop}:`,
      cls: 'ai-input-label'
    });
    label.style.fontWeight = '600';
    label.style.marginBottom = '4px';
    
    const input = inputContainer.createEl('textarea', {
      cls: 'ai-codeblock-input',
      attr: { 
        placeholder: config.emptyPlaceholder || 'Ask...',
        rows: '3'
      }
    });
    
    input.style.width = '100%';
    input.style.padding = '12px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--background-modifier-border)';
    input.style.background = 'var(--background-secondary)';
    input.style.color = 'var(--text-normal)';
    input.style.fontSize = '14px';
    input.style.resize = 'vertical';
    
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      if (entry) {
        input.value = entry.ask || '';
      }
    } else {
      const loopKey = `loop${currentLoop}`;
      if (cache[loopKey]?.[`ask-${currentLoop}`]) {
        input.value = cache[loopKey][`ask-${currentLoop}`];
      }
    }
    
    const sendBtn = inputContainer.createEl('button', { 
      text: 'Send',
      cls: 'ai-codeblock-send'
    });
    sendBtn.style.marginTop = '8px';
    sendBtn.style.padding = '8px 16px';
    sendBtn.style.borderRadius = '6px';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'var(--text-on-accent)';
    sendBtn.style.border = 'none';
    sendBtn.style.cursor = 'pointer';
    
    sendBtn.addEventListener('click', () => {
      this.handleFullInput(block, input.value);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.handleFullInput(block, input.value);
      }
    });
  }

  renderFullResponse(block) {
    const { container, config, currentLoop, cache } = block;
    
    const responseContainer = container.createDiv({ cls: 'ai-full-response' });
    responseContainer.style.padding = '16px';
    responseContainer.style.background = 'var(--background-secondary)';
    responseContainer.style.borderRadius = '8px';
    responseContainer.style.minHeight = '100px';
    
    const label = responseContainer.createEl('div', { 
      text: `Response ${currentLoop}:`,
      cls: 'ai-response-label'
    });
    label.style.fontWeight = '600';
    label.style.marginBottom = '8px';
    
    const contentDiv = responseContainer.createDiv({ cls: 'ai-response-content' });
    contentDiv.style.fontSize = '14px';
    contentDiv.style.lineHeight = '1.6';
    
    let responseText = '';
    if (config.repeating === 'Loop') {
      const entry = cache.session_log?.find(e => e.id === currentLoop);
      responseText = entry?.res || '';
    } else {
      const loopKey = `loop${currentLoop}`;
      responseText = cache[loopKey]?.[`res-${currentLoop}`] || '';
    }
    
    if (responseText) {
      MarkdownRenderer.render(
        this.plugin.app,
        responseText,
        contentDiv,
        '',
        this.plugin
      );
    } else {
      contentDiv.textContent = '';
    }
  }

  // ==================== HANDLER METHODS ====================

  async handleSimpleInput(block, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, currentLoop, cache } = block;
    
    try {
      this.showSimpleLoading(block);
      
      const messages = [{ role: 'user', content: userInput }];
      
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });
      
      if (config.repeating === 'Loop') {
        if (!cache.session_log) cache.session_log = [];
        
        const existingIndex = cache.session_log.findIndex(e => e.id === currentLoop);
        if (existingIndex !== -1) {
          cache.session_log[existingIndex] = {
            id: currentLoop,
            ask: userInput,
            res: result.final
          };
        } else {
          cache.session_log.push({
            id: currentLoop,
            ask: userInput,
            res: result.final
          });
        }
        
        cache.session_log.sort((a, b) => a.id - b.id);
        block.currentLoop = cache.session_log.length + 1;
        
      } else {
        const loopKey = `loop${currentLoop}`;
        if (!cache[loopKey]) cache[loopKey] = {};
        cache[loopKey][`ask-${currentLoop}`] = userInput;
        cache[loopKey][`res-${currentLoop}`] = result.final;
      }
      
      block.cache = cache;
      this.renderBlock(block.id);
      
      await this.saveCache(block);
      
    } catch (error) {
      console.error('AI Code Block Error:', error);
      this.showSimpleError(block, error.message);
    }
  }

  async handleSeparateInput(block, ioId, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, cache } = block;
    
    try {
      const loadingDiv = block.container.createDiv({ cls: 'ai-loading' });
      loadingDiv.style.padding = '4px';
      loadingDiv.style.textAlign = 'center';
      loadingDiv.style.color = 'var(--text-muted)';
      loadingDiv.style.fontSize = '12px';
      loadingDiv.textContent = '⏳ Thinking...';
      
      const messages = [{ role: 'user', content: userInput }];
      
      if (config.systemPrompt) {
        messages.unshift({ role: 'system', content: config.systemPrompt });
      }
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });
      
      loadingDiv.remove();
      
      if (!cache[ioId]) {
        cache[ioId] = {};
      }
      cache[ioId].ask = userInput;
      cache[ioId].res = result.final;
      
      block.cache = cache;
      
      await this.saveCache(block);
      
      const inputField = block.container.querySelector('.ai-separate-input-field');
      if (inputField) {
        inputField.value = '';
      }
      
      new Notice(`✓ Answer saved for ID: ${ioId}`);
      
    } catch (error) {
      console.error('AI Separate IO Error:', error);
      const loadingDiv = block.container.querySelector('.ai-loading');
      if (loadingDiv) loadingDiv.remove();
      
      const errorDiv = block.container.createDiv({ cls: 'ai-error' });
      errorDiv.style.padding = '8px';
      errorDiv.style.marginTop = '4px';
      errorDiv.style.borderRadius = '4px';
      errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
      errorDiv.style.color = 'var(--text-error)';
      errorDiv.style.border = '1px solid var(--text-error)';
      errorDiv.style.fontSize = '12px';
      errorDiv.textContent = `⨉ Error: ${error.message}`;
      
      setTimeout(() => errorDiv.remove(), 5000);
    }
  }

  async handleFullInput(block, userInput) {
    if (!userInput.trim()) {
      new Notice('Please enter a question');
      return;
    }
    
    const { config, currentLoop, cache } = block;
    
    try {
      this.showFullLoading(block);
      
      const messages = this.prepareMessages(block, userInput);
      
      const provider = this.getProvider(config.model);
      if (!provider) {
        throw new Error(`Provider not found for model: ${config.model}`);
      }
      
      const result = await provider.send({
        messages: messages,
        temperature: this.plugin.settings.temperature,
        max_tokens: this.plugin.settings.max_tokens,
        stream: false
      }, {
        timeoutMs: this.plugin.settings.timeoutMs
      });
      
      this.storeResponse(block, userInput, result.final);
      
      if (config.repeating === 'Loop') {
        block.currentLoop = (cache.session_log?.length || 0) + 1;
      }
      
      this.renderBlock(block.id);
      await this.saveCache(block);
      
    } catch (error) {
      console.error('AI Code Block Error:', error);
      this.showFullError(block, error.message);
    }
  }

  showSimpleLoading(block) {
    const { container } = block;
    const existing = container.querySelector('.ai-simple-loading');
    if (existing) existing.remove();
    
    const loadingDiv = container.createDiv({ cls: 'ai-simple-loading' });
    loadingDiv.style.padding = '12px';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = 'var(--text-muted)';
    loadingDiv.style.background = 'var(--background-secondary)';
    loadingDiv.style.borderRadius = '6px';
    loadingDiv.style.marginTop = '8px';
    loadingDiv.style.fontSize = '14px';
    loadingDiv.style.fontStyle = 'italic';
    loadingDiv.textContent = '🤖 Thinking...';
    
    setTimeout(() => { if (loadingDiv.parentNode) loadingDiv.remove(); }, 100);
  }

  showSimpleError(block, errorMessage) {
    const { container } = block;
    const errorDiv = container.createDiv({ cls: 'ai-simple-error' });
    errorDiv.style.padding = '12px';
    errorDiv.style.marginTop = '8px';
    errorDiv.style.borderRadius = '6px';
    errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
    errorDiv.style.color = 'var(--text-error)';
    errorDiv.style.border = '1px solid var(--text-error)';
    errorDiv.style.fontSize = '13px';
    errorDiv.textContent = `⨉ Error: ${errorMessage}`;
    
    setTimeout(() => { if (errorDiv.parentNode) errorDiv.remove(); }, 5000);
  }

  showFullLoading(block) {
    const { container } = block;
    const loadingDiv = container.createDiv({ cls: 'ai-loading' });
    loadingDiv.style.padding = '8px';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = 'var(--text-muted)';
    loadingDiv.textContent = '🤖 Thinking...';
    setTimeout(() => loadingDiv.remove(), 100);
  }

  showFullError(block, errorMessage) {
    const { container } = block;
    const errorDiv = container.createDiv({ cls: 'ai-error' });
    errorDiv.style.padding = '8px';
    errorDiv.style.margin = '8px 0';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
    errorDiv.style.color = 'var(--text-error)';
    errorDiv.style.border = '1px solid var(--text-error)';
    errorDiv.textContent = `⨉ Error: ${errorMessage}`;
    setTimeout(() => errorDiv.remove(), 5000);
  }

  // ==================== COMMON METHODS ====================

  prepareMessages(block, userInput) {
    const { config, cache, currentLoop } = block;
    const messages = [];
    
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    
    if (config.memory !== 'Current') {
      const contextMessages = this.getContextMessages(block);
      messages.push(...contextMessages);
    }
    
    messages.push({ role: 'user', content: userInput });
    
    return messages;
  }

  getContextMessages(block) {
    const { config, cache, currentLoop } = block;
    const contextMessages = [];
    
    if (config.memory === 'All') {
      if (config.repeating === 'Loop') {
        if (cache.session_log) {
          cache.session_log.forEach(entry => {
            contextMessages.push({ role: 'user', content: entry.ask });
            contextMessages.push({ role: 'assistant', content: entry.res });
          });
        }
      } else {
        for (let i = 1; i < currentLoop; i++) {
          const loopKey = `loop${i}`;
          if (cache[loopKey]?.[`ask-${i}`] && cache[loopKey]?.[`res-${i}`]) {
            contextMessages.push({ role: 'user', content: cache[loopKey][`ask-${i}`] });
            contextMessages.push({ role: 'assistant', content: cache[loopKey][`res-${i}`] });
          }
        }
      }
    } else if (config.memory.startsWith('Previous')) {
      const match = config.memory.match(/\((\d+)\)/);
      const n = match ? parseInt(match[1]) : 1;
      
      if (config.repeating === 'Loop' && cache.session_log) {
        const recent = cache.session_log.slice(-n);
        recent.forEach(entry => {
          contextMessages.push({ role: 'user', content: entry.ask });
          contextMessages.push({ role: 'assistant', content: entry.res });
        });
      } else {
        const start = Math.max(1, currentLoop - n);
        for (let i = start; i < currentLoop; i++) {
          const loopKey = `loop${i}`;
          if (cache[loopKey]?.[`ask-${i}`] && cache[loopKey]?.[`res-${i}`]) {
            contextMessages.push({ role: 'user', content: cache[loopKey][`ask-${i}`] });
            contextMessages.push({ role: 'assistant', content: cache[loopKey][`res-${i}`] });
          }
        }
      }
    }
    
    return contextMessages;
  }

  storeResponse(block, userInput, response) {
    const { config, currentLoop, cache } = block;
    
    if (config.repeating === 'Loop') {
      if (!cache.session_log) {
        cache.session_log = [];
      }
      
      const existingIndex = cache.session_log.findIndex(entry => entry.id === currentLoop);
      
      if (existingIndex !== -1) {
        cache.session_log[existingIndex] = {
          id: currentLoop,
          ask: userInput,
          res: response
        };
      } else {
        cache.session_log.push({
          id: currentLoop,
          ask: userInput,
          res: response
        });
      }
      
      cache.session_log.sort((a, b) => a.id - b.id);
      
    } else {
      const loopKey = `loop${currentLoop}`;
      if (!cache[loopKey]) {
        cache[loopKey] = {};
      }
      
      cache[loopKey][`ask-${currentLoop}`] = userInput;
      cache[loopKey][`res-${currentLoop}`] = response;
    }
  }

  getProvider(model) {
    if (model && model !== '') {
      const providerMap = {
        'local': 'local',
        'gemini': 'gemini',
        'google': 'gemini',
        'anthropic': 'anthropic',
        'claude': 'anthropic',
        'openai': 'openai',
        'chatgpt': 'openai',
        'custom': 'custom'
      };
      
      const modelLower = model.toLowerCase();
      let providerType = providerMap[modelLower];
      
      if (!providerType) {
        if (modelLower.includes('gemini') || modelLower.includes('google')) {
          providerType = 'gemini';
        } else if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
          providerType = 'anthropic';
        } else if (modelLower.includes('gpt') || modelLower.includes('openai') || modelLower.includes('chatgpt')) {
          providerType = 'openai';
        } else if (modelLower.includes('local')) {
          providerType = 'local';
        } else {
          providerType = this.plugin.settings.currentMode === 'local' ? 'local' : this.plugin.settings.cloudApiType;
        }
      }
      
      const provider = this.plugin.apiManager.providers[providerType];
      if (!provider) {
        const mode = this.plugin.settings.currentMode;
        const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
        return this.plugin.apiManager.providers[apiType];
      }
      
      return provider;
    }
    
    const mode = this.plugin.settings.currentMode;
    const apiType = mode === 'cloud' ? this.plugin.settings.cloudApiType : 'local';
    return this.plugin.apiManager.providers[apiType];
  }

  // ==================== ROBUST CACHING METHODS ====================

  async saveCache(block) {
  const { config, id, cache } = block;

    if (config.caching === 'Temporary') {
    return; 
  }
    if (config.caching === 'Data.json') {
      if (!this.plugin.settings.codeBlockCache) {
        this.plugin.settings.codeBlockCache = {};
      }
      this.plugin.settings.codeBlockCache[id] = JSON.parse(JSON.stringify(cache));
      await this.plugin.saveSettings();
      new Notice('✓ Cache saved to plugin data');
    } 
    else if (config.caching === 'Code Block') {
      await this.updateCodeBlockSource(block);
    }
  }

  async updateCodeBlockSource(block) {
    // 1. أضفنا استخراج config هنا (مهم جداً)
    const { cache, ctx, el, config } = block;
    
    // 2. الفحص الأول (عبر المتغيرات): تجاهل المسافات وحالة الأحرف
    if (config && config.caching) {
      const cacheType = config.caching.toString().toLowerCase().trim();
      if (cacheType === 'temporary' || cacheType === 'مؤقت') {
        // نخرج فوراً قبل القيام بأي عمليات قراءة/كتابة للملف
        console.log('⏳ Temporary cache bypassed saving via config.');
        return true; 
      }
    }

    try {
      const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file) {
        console.warn('Cannot find active file to save cache');
        return false;
      }
      
      const file = view.file;
      const content = await this.plugin.app.vault.read(file);
      const lines = content.split('\n');
      
      // Use Obsidian's native Context API
      const sectionInfo = ctx.getSectionInfo(el);
      
      if (!sectionInfo) {
        new Notice('⚠ Cannot save cache: Code block context lost. Did you switch files?');
        return false;
      }
      
      const { lineStart, lineEnd } = sectionInfo;
      
      // Extract ONLY the lines strictly inside this specific code block
      const blockLines = lines.slice(lineStart + 1, lineEnd);
      
      // 3. الفحص الثاني (الاحتياطي المضمون): نقرأ الأسطر مباشرة من الملف
      // هذا يضمن أنه حتى لو لم يكن `config` موجوداً، سيتم رصد خيار المؤقت
      const isTemporaryText = blockLines.some(line => {
        const cleanLine = line.toLowerCase().replace(/\s/g, ''); // إزالة كل المسافات
        return cleanLine.includes('caching:temporary') || cleanLine.includes('caching:مؤقت');
      });

      if (isTemporaryText) {
        console.log('⏳ Temporary cache bypassed saving via text reading.');
        return true; // خروج آمن بدون كتابة
      }

      // 4. Filter out ANY existing cache line cleanly.
      const cleanLines = blockLines.filter(line => 
        !line.trim().startsWith('cached data:')
      );
      
      // 5. Stringify cache to a SINGLE LINE
      const cacheJSON = JSON.stringify(cache);
      
      // 6. Append the new cache line
      cleanLines.push(`cached data: ${cacheJSON}`);
      
      // 7. Reconstruct the entire file seamlessly
      const newLines = [
        ...lines.slice(0, lineStart + 1), // File content up to ```ai
        ...cleanLines,                    // Updated code block contents
        ...lines.slice(lineEnd)           // File content after ```
      ];
      
      // Write safely back to the vault
      await this.plugin.app.vault.modify(file, newLines.join('\n'));
      
      new Notice('✓ Cache successfully saved to code block');
      return true;
      
    } catch (e) {
      console.error('Error saving cache to code block:', e);
      new Notice('⚠ Error saving cache: ' + e.message);
      return false;
    }
  }
}

class AiChatBlockRenderer extends MarkdownRenderChild {
    constructor(containerEl, plugin, source, ctx) {
        super(containerEl); 
        this.plugin = plugin;
        this.source = source;
        this.ctx = ctx;
        this.blockId = null;
        this.isProcessing = false;
    }

    async onload() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        try {
            if (this.plugin.codeBlockProcessor) {
                this.blockId = await this.plugin.codeBlockProcessor.process(
                    this.source, 
                    this.containerEl, 
                    this.ctx
                );
            }
        } catch (error) {
            console.error('Error in AiChatBlockRenderer:', error);
            this.containerEl.empty();
            const errorDiv = this.containerEl.createDiv({ cls: 'ai-error' });
            errorDiv.style.padding = '12px';
            errorDiv.style.color = 'var(--text-error)';
            errorDiv.style.background = 'rgba(var(--background-modifier-error-rgb), 0.1)';
            errorDiv.style.borderRadius = '8px';
            errorDiv.textContent = `⚠ AI Block Error: ${error.message}`;
        } finally {
            this.isProcessing = false;
        }
    }

    onunload() {
        // Clean up the block from the processor
        if (this.blockId && this.plugin.codeBlockProcessor) {
            this.plugin.codeBlockProcessor.activeBlocks.delete(this.blockId);
        }
        
        // Remove all children from the container
        if (this.containerEl) {
            this.containerEl.empty();
        }
        
        // Clear references to prevent memory leaks
        this.plugin = null;
        this.ctx = null;
    }
}

// ==================== MAIN PLUGIN ====================

module.exports = class AIPlugin extends Plugin {
  async getUniqueFilePath(folderPath, baseName, extension = 'md') {
    let counter = 1;
    let fileName = `${baseName}.${extension}`;
    let fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
    
    if (await this.app.vault.adapter.exists(fullPath)) {
        new Notice(`File already exists, copy from conversation '${fileName}'`);
        
        while (await this.app.vault.adapter.exists(fullPath)) {
            fileName = `${baseName} (${counter}).${extension}`;
            fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
            counter++;
        }
    }
    
    return fullPath;
  }

  /**
   * Generate a conversation name based on the first message using AI
   * @param {string} firstMessage - The first user message in the conversation
   * @returns {Promise<string|null>} - Generated name or null if failed
   */
  async generateConversationName(firstMessage) {
    // Don't attempt to generate names for empty messages
    if (!firstMessage || firstMessage.trim().length === 0) {
      return null;
    }
    
    // Check if auto-naming is enabled in settings
    if (!this.settings.autoNameConversations) {
      return null;
    }
    
    // Truncate very long messages to avoid excessive token usage
    const messagePreview = firstMessage.length > 500 ? 
      firstMessage.substring(0, 500) + "..." : firstMessage;
    
    const prompt = `Based on this first message, generate a very short, concise title (maximum 5-6 words) for a conversation. The title should capture the main topic or intent. Return ONLY the title, no quotes, no explanations, no extra text, no punctuation at the end.

First message: "${messagePreview}"

Conversation title:`;
    
    try {
      const result = await this.apiManager.sendMessage({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 30, // Just need a short title
        stream: false // Don't need streaming for this
      }, {
        timeoutMs: 10000 // 10 second timeout
      });
      
      if (result && result.final) {
        // Clean up the response
        let title = result.final.trim();
        
        // Remove quotes if present
        title = title.replace(/^["']|["']$/g, '');
        
        // Remove any extra punctuation at the end
        title = title.replace(/[.!?]$/, '');
        
        // Remove any extra whitespace
        title = title.replace(/\s+/g, ' ').trim();
        
        // Limit length
        if (title.length > 50) {
          title = title.substring(0, 50) + '...';
        }
        
        // Ensure we have a valid title
        if (title.length > 0) {
          return title;
        }
      }
    } catch (error) {
      console.log("Error generating conversation name:", error);
      // Silent fail - just use default name
    }
    
    return null;
  }

  async onload() {
  this.loadCSS();
  await this.loadSettings();
  
  const saved = await this.loadData();
  // Pass saved sessions to SessionManager, which will filter temporary ones automatically
  this._sessionManager = saved && saved.sessions ? new SessionManager(saved.sessions) : new SessionManager();
  if (!this._sessionManager.sessions.length) this._sessionManager.create('Default Conversation', '');

  this.apiManager = new APIManager(this);
  this.inNoteAI = new InNoteAIInteractions(this);
  this.networkManager = new NetworkManager(this);

  // Register the AI code block processor
  this.codeBlockProcessor = new AICodeBlockProcessor(this);
  this.registerMarkdownCodeBlockProcessor('ai', (source, el, ctx) => {
    const renderer = new AiChatBlockRenderer(el, this, source, ctx);
        ctx.addChild(renderer);
  });

  this.registerView(VIEW_TYPE, (leaf) => new ChatView(leaf, this));

  this.addRibbonIcon('brain', 'AI Assistant', () => {
    this.openSidebar();
  });

  this.addCommand({
    id: 'ai-open-sidebar',
    name: 'Open AI Assistant Sidebar',
    callback: async () => this.openSidebar()
  });
  
  this.addCommand({
    id: 'ai-reply-in-note',
    name: 'Stream AI response in current note',
    editorCallback: (editor) => this.replyInNote(editor)
  });

  this.addCommand({
    id: 'ai-new-conversation',
    name: 'New Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "N" }],
    callback: () => {
      const activeView = this.app.workspace.getActiveViewOfType(ChatView);
      if (activeView) {
        activeView.createNewConversation();
      } else {
        // Modified to allow empty name for auto-naming
        const name = prompt('New conversation name (leave empty for auto-name):', '');
        
        if (name !== null) {
          if (name.trim()) {
            // User provided a name
            this._sessionManager.create(name.trim());
            this.saveState();
            new Notice(`✓ Created conversation: ${name}`);
          } else {
            // User left it empty, create with default name first
            const session = this._sessionManager.create('New Conversation');
            this.saveState();
            
            // Notify about auto-naming if enabled
            if (this.settings.autoNameConversations) {
              new Notice('Conversation will be auto-named after first message');
            } else {
              new Notice('✓ Created new conversation');
            }
          }
        }
      }
    }
  });

  this.addCommand({
    id: 'ai-save-conversation',
    name: 'Save Current Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "S" }],
    callback: () => {
      const activeView = this.app.workspace.getActiveViewOfType(ChatView);
      if (activeView) {
        activeView.saveCurrentConversation();
      } else {
        this.saveCurrentConversationFromAnywhere();
      }
    }
  });

  // Add command to manually rename current conversation
  this.addCommand({
    id: 'ai-rename-conversation',
    name: 'Rename Current Conversation',
    hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "R" }],
    callback: () => {
      const session = this._sessionManager.getActive();
      if (!session) {
        new Notice('No active conversation to rename');
        return;
      }
      
      const newName = prompt('Enter new conversation name:', session.name);
      if (newName && newName.trim()) {
        session.name = newName.trim();
        this.saveState();
        new Notice(`✓ Conversation renamed to: ${newName}`);
        
        // Refresh any open chat views
        this.refreshChatViews();
      }
    }
  });

  // Add command to create a new AI code block
  this.addCommand({
    id: 'ai-insert-codeblock',
    name: 'Insert AI Code Block',
    editorCallback: (editor) => {
      const template = '```ai\nEnvironment: Full\nSystem Prompt: You are a helpful assistant\nModel: \nRepeating: 1\nMoving: Arrow\nMemory: Current\nCaching: Code Block\n```';
      editor.replaceSelection(template);
    }
  });

  if (this.settings.autoCheckHealth) {
    setTimeout(() => this.checkHealthAndNotify(), 3000);
  }
  }

  /**
   * Refresh all open chat views
   */
  refreshChatViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
      if (leaf.view instanceof ChatView) {
        leaf.view._renderMessages();
      }
    });
  }

  loadCSS() {
    const styleEl = document.createElement('style');
    styleEl.id = 'ai-plugin-css';
    styleEl.textContent = `
    // Add to the loadCSS method:

.ai-codeblock-container {
  margin: 16px 0;
  transition: all 0.3s ease;
}

.ai-codeblock-container:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.ai-codeblock-input {
  transition: border-color 0.2s ease;
}

.ai-codeblock-input:focus {
  outline: none;
  border-color: var(--interactive-accent) !important;
}

.ai-codeblock-send:hover {
  filter: brightness(1.1);
}

.ai-codeblock-send:active {
  transform: scale(0.98);
}

.ai-flow-entry {
  transition: background-color 0.2s ease;
}

.ai-flow-entry:hover {
  background-color: var(--background-secondary-alt) !important;
}

.ai-nav-bar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-nav-bar button:not(:disabled):hover {
  background-color: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
}

.ai-loading {
  animation: ai-pulse 1.5s infinite;
}

@keyframes ai-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
      @keyframes ai-float-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .ai-floating-menu {
        animation: ai-float-in 0.2s ease;
      }
      
      .ai-floating-btn:hover {
        transform: scale(1.1) !important;
        background: var(--interactive-accent-hover) !important;
      }
      
      .ai-token-counter {
        transition: all 0.3s ease;
      }
      
      .ai-token-counter:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      }
      
      /* Auto-naming indicator */
      .ai-naming-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--text-muted);
        animation: ai-pulse 1.5s infinite;
      }
      
      @keyframes ai-pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  async checkHealthAndNotify() {
    const health = await this.apiManager.checkHealth();
    if (!health.ok) {
      new Notice(`${health.message}`);
    }
  }

  async saveCurrentConversationFromAnywhere() {
    const session = this._sessionManager.getActive();
    if (!session) {
        new Notice('No active conversation to save');
        return;
    }
    
    try {
        const content = this._sessionManager.exportToMarkdown(session);
        const folderPath = this.settings.conversationsFolder || 'AI Conversations';
        const baseName = session.name.replace(/[\\/:*?"<>|]/g, '_');
        
        const folderExists = await this.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
            await this.app.vault.createFolder(folderPath);
        }
        
        const fullPath = await this.getUniqueFilePath(folderPath, baseName, 'md');
        
        await this.app.vault.create(fullPath, content);
        new Notice(`✓ Conversation saved to: ${fullPath}`);
    } catch (error) {
        console.error('Error saving conversation:', error);
        new Notice(`⨉ Error saving conversation: ${error.message}`);
    }
  }

  async replyInNote(editor) {
    const selection = editor.getSelection().trim();
    const prompt = selection.length ? selection : editor.getValue();
    
    const s = this._sessionManager.getActive();
    if (s) {
      this._sessionManager.addMessage('user', prompt);
    }
    
    editor.replaceSelection("\n\n--- 🤖 AI Response ---\n\n");
    
    try {
      await this.apiManager.sendMessage({
        messages: s ? this._sessionManager.getMessagesForRequest() : [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
        max_tokens: this.settings.max_tokens,
        stream: true
      }, {
        onChunk: (chunk) => {
          editor.replaceSelection(chunk);
        },
        timeoutMs: this.settings.timeoutMs
      });
      
      editor.replaceSelection("\n\n---\n\n");
      new Notice('✓ Response completed');
    } catch (e) {
      editor.replaceSelection(`\n\n⨉ Error: ${e.message}\n\n`);
      new Notice('AI Error: ' + e.message);
    }
  }

  async openSidebar() {
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) leaf = this.app.workspace.getRightLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  // Save state: only save non-temporary sessions
  async saveState() {
    const nonTemporarySessions = this._sessionManager.sessions.filter(s => !s.isTemporary);
    await this.saveData({ ...this.settings, sessions: nonTemporarySessions });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() || {});
  }
  
  async saveSettings() { 
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => {
      if (leaf.view instanceof ChatView) {
        leaf.view.updateTokenCounterVisibility();
        leaf.view.refreshLayout(); 
      }
    });
  }

  onunload() {
    // Clean up all active code blocks
    if (this.codeBlockProcessor && this.codeBlockProcessor.activeBlocks) {
        this.codeBlockProcessor.activeBlocks.clear();
    }
    
    // Delete any temporary conversation when unloading the plugin
    if (this._sessionManager) {
        this._sessionManager.deleteTemporary();
    }
    
    // Remove CSS
    const styleEl = document.getElementById('ai-plugin-css');
    if (styleEl) {
        styleEl.remove();
    }
    
    // Detach views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    
    // Abort any pending network requests
    if (this.networkManager) {
        this.networkManager.abortAllRequests();
    }
  }
}