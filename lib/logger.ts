/**
 * Simple logger for plugin debugging.
 */

import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import { homedir } from "os"

export class Logger {
    private logDir: string
    public enabled: boolean

    constructor(enabled: boolean, pluginName: string = "myplugin") {
        this.enabled = enabled
        const opencodeConfigDir = join(homedir(), ".config", "opencode")
        this.logDir = join(opencodeConfigDir, "logs", pluginName)
    }

    private async ensureLogDir() {
        if (!existsSync(this.logDir)) {
            await mkdir(this.logDir, { recursive: true })
        }
    }

    private formatData(data?: any): string {
        if (!data) return ""

        const parts: string[] = []
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined || value === null) continue

            if (Array.isArray(value)) {
                if (value.length === 0) continue
                parts.push(`${key}=[${value.slice(0, 3).join(",")}${value.length > 3 ? `...+${value.length - 3}` : ""}]`)
            }
            else if (typeof value === 'object') {
                const str = JSON.stringify(value)
                if (str.length < 50) {
                    parts.push(`${key}=${str}`)
                }
            }
            else {
                parts.push(`${key}=${value}`)
            }
        }
        return parts.join(" ")
    }

    private async write(level: string, component: string, message: string, data?: any) {
        if (!this.enabled) return

        try {
            await this.ensureLogDir()

            const timestamp = new Date().toISOString()
            const dataStr = this.formatData(data)

            const logLine = `${timestamp} ${level.padEnd(5)} ${component}: ${message}${dataStr ? " | " + dataStr : ""}\n`

            const dailyLogDir = join(this.logDir, "daily")
            if (!existsSync(dailyLogDir)) {
                await mkdir(dailyLogDir, { recursive: true })
            }

            const logFile = join(dailyLogDir, `${new Date().toISOString().split('T')[0]}.log`)
            await writeFile(logFile, logLine, { flag: "a" })
        } catch (error) {
            // Silently ignore logging errors
        }
    }

    info(component: string, message: string, data?: any) {
        return this.write("INFO", component, message, data)
    }

    debug(component: string, message: string, data?: any) {
        return this.write("DEBUG", component, message, data)
    }

    warn(component: string, message: string, data?: any) {
        return this.write("WARN", component, message, data)
    }

    error(component: string, message: string, data?: any) {
        return this.write("ERROR", component, message, data)
    }
}
