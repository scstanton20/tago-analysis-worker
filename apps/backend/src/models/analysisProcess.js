// Enhanced AnalysisProcess.js
import path from 'path';
import { promises as fs } from 'fs';
import { fork } from 'child_process';
import { broadcast } from '../utils/websocket.js';
import config from '../config/default.js';

class AnalysisProcess {
  constructor(analysisName, type, service) {
    this._analysisName = analysisName;
    this.type = type;
    this.service = service;
    this.process = null;
    this.enabled = false;
    this.status = 'stopped';
    this.lastStartTime = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.logFile = path.join(
      config.paths.analysis,
      analysisName,
      'logs',
      'analysis.log',
    );

    // Enhanced log management
    this.logs = []; // In-memory buffer
    this.logSequence = 0; // Unique sequence number for each log
    this.totalLogCount = 0; // Total logs written to file
    this.maxMemoryLogs = config.analysis.maxLogsInMemory || 1000;

    // Health check management
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
  }

  get analysisName() {
    return this._analysisName;
  }

  set analysisName(newName) {
    const oldName = this._analysisName;
    this._analysisName = newName;
    this.logFile = path.join(
      config.paths.analysis,
      newName,
      'logs',
      'analysis.log',
    );
    console.log(
      `Updated analysis name from ${oldName} to ${newName} (logFile: ${this.logFile})`,
    );
  }

  async addLog(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = {
      sequence: ++this.logSequence,
      timestamp,
      message,
      createdAt: Date.now(), // For efficient sorting
    };

    const fileLogEntry = `[${timestamp}] ${message}\n`;

    // Add to in-memory buffer (FIFO)
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxMemoryLogs) {
      this.logs.pop();
    }

    // Increment total count
    this.totalLogCount++;

    try {
      // Ensure the logs directory exists
      const logsDir = path.dirname(this.logFile);
      await fs.mkdir(logsDir, { recursive: true });

      // Append to the log file
      await fs.appendFile(this.logFile, fileLogEntry);
    } catch (error) {
      console.error(`Error writing to log file ${this.logFile}:`, error);
    }

    broadcast({
      type: 'log',
      data: {
        fileName: this.analysisName,
        log: logEntry,
        totalCount: this.totalLogCount,
      },
    });
  }

  // Get logs from memory buffer
  getMemoryLogs(page = 1, limit = 100) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = this.logs.slice(startIndex, endIndex);

    return {
      logs: paginatedLogs,
      hasMore: endIndex < this.logs.length,
      totalInMemory: this.logs.length,
      totalCount: this.totalLogCount,
    };
  }

  // Initialize log count and sequence from existing file
  async initializeLogState() {
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
      this.totalLogCount = lines.length;
      this.logSequence = lines.length;

      // Load recent logs into memory
      const recentLines = lines.slice(-this.maxMemoryLogs);
      this.logs = recentLines
        .map((line, index) => {
          const match = line.match(/\[(.*?)\] (.*)/);
          return match
            ? {
                sequence: this.logSequence - recentLines.length + index + 1,
                timestamp: match[1],
                message: match[2],
                createdAt: new Date(match[1]).getTime(),
              }
            : null;
        })
        .filter(Boolean)
        .reverse();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error initializing log state:', error);
      }
      // File doesn't exist yet, start fresh
      this.totalLogCount = 0;
      this.logSequence = 0;
    }
  }

  setupProcessHandlers() {
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    if (this.process.stdout) {
      this.process.stdout.on('data', this.handleOutput.bind(this, false));
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', this.handleOutput.bind(this, true));
    }

    this.process.once('exit', this.handleExit.bind(this));
  }

  handleOutput(isError, data) {
    const buffer = isError ? this.stderrBuffer : this.stdoutBuffer;
    const lines = data.toString().split('\n');

    lines.forEach((line, index) => {
      if (index === lines.length - 1) {
        if (isError) {
          this.stderrBuffer = line;
        } else {
          this.stdoutBuffer = line;
        }
      } else {
        const fullLine = (buffer + line).trim();
        if (fullLine) {
          // Check for SDK connection errors
          if (
            fullLine.includes('¬ Connection was closed, trying to reconnect') ||
            fullLine.includes('¬ Analysis not found or not active')
          ) {
            this.addLog('Tago connection lost - restarting process');
            setTimeout(() => {
              if (this.status === 'running') {
                this.restartProcess();
              }
            }, 5000);
          }
          this.addLog(isError ? `ERROR: ${fullLine}` : fullLine);
        }
        if (isError) {
          this.stderrBuffer = '';
        } else {
          this.stdoutBuffer = '';
        }
      }
    });
  }

  async start() {
    if (this.process) return;

    try {
      // Initialize log state before starting
      await this.initializeLogState();

      const filePath = path.join(
        config.paths.analysis,
        this.analysisName,
        'index.cjs',
      );

      await this.addLog(`Node.js ${process.version}`);

      const storedEnv = this.service
        ? await this.service.getEnvironment(this.analysisName)
        : {};

      this.process = fork(filePath, [], {
        env: {
          ...process.env,
          ...config.process.env,
          ...storedEnv,
          STORAGE_BASE: config.storage.base,
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });

      if (!this.process) {
        throw new Error('Failed to start analysis process');
      }

      this.setupProcessHandlers();
      this.updateStatus('running', true);
      await this.saveConfig();
    } catch (error) {
      await this.addLog(`ERROR: ${error.message}`);
      throw error;
    }
  }

  updateStatus(status, enabled = false) {
    this.status = status;
    this.enabled = enabled;

    if (this.type === 'listener' && status === 'running') {
      this.lastStartTime = new Date().toISOString();
    }

    broadcast({
      type: 'analysisStatus',
      data: {
        fileName: this.analysisName,
        status: this.status,
        enabled: this.enabled,
        lastStartTime: this.lastStartTime,
      },
    });
  }

  async stop() {
    if (!this.process || this.status !== 'running') {
      return;
    }

    await this.addLog('Stopping analysis...');

    return new Promise((resolve) => {
      this.process.kill('SIGTERM');

      const forceKillTimeout = setTimeout(() => {
        if (this.process) {
          this.addLog('Force stopping process...').then(() => {
            this.process.kill('SIGKILL');
          });
        }
      }, config.analysis.forceKillTimeout);

      this.process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        this.updateStatus('stopped', false);
        this.addLog('Analysis stopped').then(() => {
          this.process = null;
          this.saveConfig().then(resolve);
        });
      });
    });
  }

  async saveConfig() {
    if (!this.service) {
      console.error(
        `Error: Service is undefined for analysis ${this.analysisName}`,
      );
      return;
    }
    return this.service.saveConfig();
  }

  async handleExit(code) {
    if (this.stdoutBuffer.trim()) {
      await this.addLog(this.stdoutBuffer.trim());
    }
    if (this.stderrBuffer.trim()) {
      await this.addLog(`ERROR: ${this.stderrBuffer.trim()}`);
    }

    await this.addLog(`Process exited with code ${code}`);
    this.process = null;

    this.updateStatus('stopped', false);
    await this.saveConfig();

    // Auto-restart listeners that exit unexpectedly
    if (this.type === 'listener' && this.enabled && code !== 0) {
      await this.addLog(`Listener exited unexpectedly, auto-restarting...`);
      setTimeout(() => this.start(), config.analysis.autoRestartDelay || 5000);
    }
  }
}

export default AnalysisProcess;
