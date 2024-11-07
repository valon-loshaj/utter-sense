const eslint = require("@eslint/js");
const lwc = require("@lwc/eslint-plugin-lwc");
const salesforceLwc = require("@salesforce/eslint-config-lwc/recommended");
const lightning = require("@salesforce/eslint-plugin-lightning");

module.exports = [
	eslint.configs.recommended,
	{
		files: ["**/lwc/**/*.js"],
		plugins: {
			"@lwc/lwc": lwc,
			"@salesforce/lightning": lightning
		},
		languageOptions: {
			globals: {
				// Add any global variables used in LWC
				$: true,
				require: true,
				console: true
			},
			parser: require("@babel/eslint-parser"),
			parserOptions: {
				requireConfigFile: false,
				babelOptions: {
					plugins: [
						[
							"@babel/plugin-proposal-decorators",
							{
								decoratorsBeforeExport: true,
								version: "2018-09"
							}
						]
					]
				}
			}
		},
		rules: {
			...salesforceLwc.rules,
			"@lwc/lwc/no-api-reassignments": "error",
			"@salesforce/lightning/valid-apex-method-invocation": "error"
		}
	},
	{
		files: ["**/__tests__/**/*.js"],
		languageOptions: {
			globals: {
				// Jest globals
				describe: "readonly",
				beforeEach: "readonly",
				it: "readonly",
				expect: "readonly",
				// Browser globals
				document: "readonly",
				window: "readonly",
				console: "readonly"
			}
		}
	},
	{
		files: ["**/aura/**/*.js"],
		rules: {
			// Aura specific rules
		}
	}
];
