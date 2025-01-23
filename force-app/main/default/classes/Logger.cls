/**
 * @description Utility class for handling logging operations
 * @group Utilities
 */
public with sharing class Logger {
	/**
	 * @description Logs a debug message
	 * @param level The logging level
	 * @param message The message to log
	 */
	public static void debug(LoggingLevel level, String message) {
		System.debug(level, message);
	}

	/**
	 * @description Logs an error message
	 * @param message The error message to log
	 */
	public static void error(String message) {
		System.debug(LoggingLevel.ERROR, message);
	}

	/**
	 * @description Logs a warning message
	 * @param message The warning message to log
	 */
	public static void warn(String message) {
		System.debug(LoggingLevel.WARN, message);
	}
}
