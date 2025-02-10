const eslint = require('@eslint/js');
const lwc = require('@lwc/eslint-plugin-lwc');
const salesforceLwc = require('@salesforce/eslint-config-lwc/recommended');
const lightning = require('@salesforce/eslint-plugin-lightning');
const aura = require('@salesforce/eslint-plugin-aura');

module.exports = [
    {
        ignores: ['**/*.xml']
    },
    {
        // Config file specific settings
        files: ['*.config.js', '.eslintrc.js'],
        languageOptions: {
            globals: {
                module: 'writable',
                require: 'readonly'
            }
        }
    },
    eslint.configs.recommended,
    {
        files: ['**/lwc/**/*.js'],
        plugins: {
            '@lwc/lwc': lwc,
            '@salesforce/lightning': lightning
        },
        languageOptions: {
            globals: {
                // Salesforce specific globals
                $A: 'readonly',
                sforce: 'readonly',
                moment: 'readonly',
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                navigator: 'readonly',
                Audio: 'readonly',
                Blob: 'readonly',
                MediaRecorder: 'readonly',
                FileReader: 'readonly',
                clearInterval: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                URL: 'readonly',
                requestAnimationFrame: 'readonly',
                atob: 'readonly',
                fetch: 'readonly',
                URLSearchParams: 'readonly',
                EventSource: 'readonly',
                Event: 'readonly',
                Promise: 'readonly'
            },
            parser: require('@babel/eslint-parser'),
            parserOptions: {
                requireConfigFile: false,
                ecmaVersion: 2022,
                sourceType: 'module',
                babelOptions: {
                    plugins: [
                        [
                            '@babel/plugin-proposal-decorators',
                            {
                                decoratorsBeforeExport: true,
                                version: '2018-09'
                            }
                        ]
                    ]
                }
            }
        },
        rules: {
            ...salesforceLwc.rules,
            '@lwc/lwc/no-api-reassignments': 'error',
            '@salesforce/lightning/valid-apex-method-invocation': 'error',
            '@lwc/lwc/no-async-operation': 'off',
            'no-return-await': 'off'
        }
    },
    {
        files: ['**/__tests__/**/*.js'],
        languageOptions: {
            globals: {
                // Jest globals
                describe: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                jest: 'readonly',
                // Add testing utilities globals
                createElement: 'readonly',
                getNavigateCalledWith: 'readonly'
            }
        }
    },
    {
        files: ['**/aura/**/*.js'],
        plugins: {
            '@salesforce/aura': aura
        },
        rules: {
            // Aura specific rules
            '@salesforce/aura/no-deprecated-apis': 'error',
            '@salesforce/aura/no-async-operation': 'error'
        }
    },
    {
        files: ['*.html'],
        rules: {
            'css-rcurlyexpected': 'off',
            'css-ruleorselectorexpected': 'off',
            emptyRules: 'off'
        }
    },
    {
        files: ['**/lwc/**/*.js'],
        rules: {
            '@lwc/lwc/no-inner-html': 'off',
            'no-console': 'off'
        }
    }
];
