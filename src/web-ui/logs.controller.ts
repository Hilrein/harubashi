import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { latestLogFile } from '../common/logger';
import { HarubashiPaths } from '../common/paths';

/**
 * Streams real-time backend log files using Server-Sent Events (SSE).
 */
@Controller('logs')
export class LogsController {
  @Sse('stream')
  streamLogs(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let currentFile = latestLogFile();
      let position = 0;
      let watcher: chokidar.FSWatcher | null = null;

      // 1. Emit last 50 lines as starting history
      if (!currentFile) {
        subscriber.next({
          data: JSON.stringify({
            level: 'warn',
            message: 'No log files found yet. Try starting the daemon first.',
          }),
        });
      } else {
        try {
          if (fs.existsSync(currentFile)) {
            const raw = fs.readFileSync(currentFile, 'utf-8');
            const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
            const trailing = lines.slice(-50);
            for (const line of trailing) {
              subscriber.next({ data: line });
            }
            position = fs.statSync(currentFile).size;
          }
        } catch (err) {
          subscriber.next({
            data: JSON.stringify({
              level: 'error',
              message: `Failed to read log history: ${(err as Error).message}`,
            }),
          });
        }
      }

      // 2. Set up Chokidar directory watcher to stream modifications in real-time
      watcher = chokidar.watch(HarubashiPaths.logsDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

      watcher.on('add', (filePath) => {
        if (!/harubashi-\d{4}-\d{2}-\d{2}\.log$/.test(filePath)) return;
        if (!currentFile || filePath > currentFile) {
          currentFile = filePath;
          position = 0;
        }
      });

      watcher.on('change', async (filePath) => {
        if (filePath !== currentFile) return;
        try {
          if (!fs.existsSync(filePath)) return;
          const stat = fs.statSync(filePath);
          if (stat.size <= position) return;

          const stream = fs.createReadStream(filePath, {
            start: position,
            end: stat.size,
            encoding: 'utf-8',
          });

          let buffer = '';
          for await (const chunk of stream) {
            buffer += chunk;
          }

          position = stat.size;
          const newLines = buffer.split(/\r?\n/).filter((l) => l.trim().length > 0);
          for (const line of newLines) {
            subscriber.next({ data: line });
          }
        } catch (err) {
          subscriber.next({
            data: JSON.stringify({
              level: 'error',
              message: `Error reading updates: ${(err as Error).message}`,
            }),
          });
        }
      });

      // 3. Clean up watcher on client disconnect
      return () => {
        if (watcher) {
          watcher.close().catch((err) => {
            console.error('Failed to close log stream chokidar watcher:', err);
          });
        }
      };
    });
  }
}
