const eslint = require("@eslint/js");
const lwc = require("@lwc/eslint-plugin-lwc");
const salesforceLwc = require("@salesforce/eslint-config-lwc/recommended");
const lightning = require("@salesforce/eslint-plugin-lightning");
const aura = require("@salesforce/eslint-plugin-aura");

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
				// Salesforce specific globals
				$A: "readonly",
				sforce: "readonly",
				moment: "readonly",
				// Browser globals
				window: "readonly",
				document: "readonly",
				console: "readonly"
			},
			parser: require("@babel/eslint-parser"),
			parserOptions: {
				requireConfigFile: false,
				ecmaVersion: 2022,
				sourceType: "module",
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
			"@salesforce/lightning/valid-apex-method-invocation": "error",
			"@lwc/lwc/no-unknown-wire-adapters": "error",
			"@lwc/lwc/no-unexpected-wire-adapter-usages": "error"
		}
	},
	{
		files: ["**/__tests__/**/*.js"],
		languageOptions: {
			globals: {
				// Jest globals
				describe: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
				it: "readonly",
				expect: "readonly",
				jest: "readonly",
				// Add testing utilities globals
				createElement: "readonly",
				getNavigateCalledWith: "readonly"
			}
		}
	},
	{
		files: ["**/aura/**/*.js"],
		plugins: {
			"@salesforce/aura": aura
		},
		rules: {
			// Aura specific rules
			"@salesforce/aura/no-deprecated-apis": "error",
			"@salesforce/aura/no-async-operation": "error"
		}
	}
];
