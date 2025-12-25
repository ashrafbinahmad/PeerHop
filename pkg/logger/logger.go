package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogLevel represents the severity of a log message
type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
)

var levelNames = map[LogLevel]string{
	DEBUG: "DEBUG",
	INFO:  "INFO",
	WARN:  "WARN",
	ERROR: "ERROR",
}

// Logger is the global logger instance
type Logger struct {
	mu            sync.Mutex
	logFile       *os.File
	logPath       string
	minLevel      LogLevel
	enableConsole bool
}

var (
	instance *Logger
	once     sync.Once
)

// Config holds logger configuration
type Config struct {
	LogDir        string   // Directory to store log files
	MinLevel      LogLevel // Minimum level to log
	EnableConsole bool     // Also log to console
	MaxSizeMB     int      // Max size of log file before rotation
}

// Init initializes the global logger
func Init(config Config) error {
	var err error
	once.Do(func() {
		instance = &Logger{
			minLevel:      config.MinLevel,
			enableConsole: config.EnableConsole,
		}

		// Create log directory if it doesn't exist
		if err = os.MkdirAll(config.LogDir, 0755); err != nil {
			return
		}

		// Create log file with timestamp
		timestamp := time.Now().Format("2006-01-02")
		logFileName := fmt.Sprintf("peerhop_%s.log", timestamp)
		instance.logPath = filepath.Join(config.LogDir, logFileName)

		instance.logFile, err = os.OpenFile(
			instance.logPath,
			os.O_CREATE|os.O_WRONLY|os.O_APPEND,
			0644,
		)
		if err != nil {
			return
		}

		// Check file size and rotate if needed
		if config.MaxSizeMB > 0 {
			stat, statErr := instance.logFile.Stat()
			if statErr == nil && stat.Size() > int64(config.MaxSizeMB*1024*1024) {
				instance.rotateLog()
			}
		}

		// Redirect standard log to our logger
		log.SetOutput(instance)
		log.SetFlags(0) // We handle timestamps ourselves
	})
	return err
}

// Write implements io.Writer interface for standard log compatibility
func (l *Logger) Write(p []byte) (n int, err error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.logFile != nil {
		return l.logFile.Write(p)
	}
	return 0, nil
}

// rotateLog creates a new log file with incremented suffix
func (l *Logger) rotateLog() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.logFile != nil {
		l.logFile.Close()
	}

	// Rename current log file with timestamp suffix
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	dir := filepath.Dir(l.logPath)
	base := filepath.Base(l.logPath)
	rotatedPath := filepath.Join(dir, fmt.Sprintf("%s.%s", base, timestamp))

	if err := os.Rename(l.logPath, rotatedPath); err != nil {
		return err
	}

	// Create new log file
	var err error
	l.logFile, err = os.OpenFile(
		l.logPath,
		os.O_CREATE|os.O_WRONLY|os.O_APPEND,
		0644,
	)
	return err
}

// log writes a message with the specified level
func (l *Logger) log(level LogLevel, format string, v ...interface{}) {
	if l == nil || level < l.minLevel {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	message := fmt.Sprintf(format, v...)
	logLine := fmt.Sprintf("[%s] [%s] %s\n", timestamp, levelNames[level], message)

	// Write to file
	if l.logFile != nil {
		l.logFile.WriteString(logLine)
	}

	// Also write to console if enabled
	if l.enableConsole {
		if level >= ERROR {
			fmt.Fprint(os.Stderr, logLine)
		} else {
			fmt.Print(logLine)
		}
	}
}

// Debug logs a debug message
func Debug(format string, v ...interface{}) {
	if instance != nil {
		instance.log(DEBUG, format, v...)
	}
}

// Info logs an info message
func Info(format string, v ...interface{}) {
	if instance != nil {
		instance.log(INFO, format, v...)
	}
}

// Warn logs a warning message
func Warn(format string, v ...interface{}) {
	if instance != nil {
		instance.log(WARN, format, v...)
	}
}

// Error logs an error message
func Error(format string, v ...interface{}) {
	if instance != nil {
		instance.log(ERROR, format, v...)
	}
}

// GetLogPath returns the path to the current log file
func GetLogPath() string {
	if instance != nil {
		return instance.logPath
	}
	return ""
}

// GetRecentLogs returns the last N lines from the log file
func GetRecentLogs(lines int) ([]string, error) {
	if instance == nil {
		return nil, fmt.Errorf("logger not initialized")
	}

	instance.mu.Lock()
	logPath := instance.logPath
	instance.mu.Unlock()

	// Read the entire file (for simplicity; could be optimized for large files)
	data, err := os.ReadFile(logPath)
	if err != nil {
		return nil, err
	}

	// Split into lines
	allLines := []string{}
	currentLine := ""
	for _, b := range data {
		if b == '\n' {
			allLines = append(allLines, currentLine)
			currentLine = ""
		} else {
			currentLine += string(b)
		}
	}
	if currentLine != "" {
		allLines = append(allLines, currentLine)
	}

	// Return last N lines
	if len(allLines) <= lines {
		return allLines, nil
	}
	return allLines[len(allLines)-lines:], nil
}

// Close closes the log file
func Close() {
	if instance != nil {
		instance.mu.Lock()
		defer instance.mu.Unlock()
		if instance.logFile != nil {
			instance.logFile.Close()
			instance.logFile = nil
		}
	}
}

// GetLogFiles returns all log files in the log directory
func GetLogFiles() ([]string, error) {
	if instance == nil {
		return nil, fmt.Errorf("logger not initialized")
	}

	instance.mu.Lock()
	logDir := filepath.Dir(instance.logPath)
	instance.mu.Unlock()

	entries, err := os.ReadDir(logDir)
	if err != nil {
		return nil, err
	}

	var logFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".log" {
			logFiles = append(logFiles, filepath.Join(logDir, entry.Name()))
		}
	}

	return logFiles, nil
}

// MultiWriter creates a writer that writes to both the logger and another writer
func MultiWriter(w io.Writer) io.Writer {
	if instance != nil {
		return io.MultiWriter(instance, w)
	}
	return w
}
