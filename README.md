<h1 align="center">Utter Sense 🎯</h1>

<p align="center">A real-time intelligence tool that listens to voice calls, using cutting-edge vector search to match agent conversations with relevant knowledge articles. Empower agents with instant, context-aware recommendations and streamline support workflows for smarter, faster resolutions.</p>

<p align="center">
    <a href="https://github.com/your-username/utter-sense/blob/main/.github/CODE_OF_CONDUCT.md" target="_blank"><img alt="🤝 Code of Conduct: Kept" src="https://img.shields.io/badge/%F0%9F%A4%9D_code_of_conduct-kept-21bb42" /></a>
    <a href="https://codecov.io/gh/your-username/utter-sense" target="_blank"><img alt="🧪 Coverage" src="https://img.shields.io/codecov/c/github/your-username/utter-sense?label=%F0%9F%A7%AA%20coverage" /></a>
    <a href="https://github.com/your-username/utter-sense/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg"></a>
</p>

## Prerequisites ✅

Before installing this package, ensure you have:

-   A Salesforce org with the following features enabled:
    -   Einstein 1 AI Platform
    -   Live Agent
    -   Live Message
    -   Lightning Service Console
    -   AgentForce
-   Omni-Channel routing enabled and configured for message session routing
-   Einstein GPT Platform enabled in your org settings
-   Prompt Builder permission sets assigned to users who will be using this feature
-   Salesforce CLI installed on your machine
-   OpenAI API key for audio transcription and text-to-speech features
-   SCRT URL for your embedded service deployment

## Installation 🚀

1. Clone this repository to your local machine
2. Deploy the components to your Salesforce org using the SF CLI:

```bash
sf project deploy start -d force-app
```

3. Assign the Utter Sense permissions to users:

```bash
sf org assign permset --name Utter_Sense_Permissions --target-org your-org-alias
```

4. Configure Remote Site Settings:

    - Navigate to Setup > Remote Site Settings
    - Click "New Remote Site"
    - Enter a name for your remote site (e.g., "Utter_Sense_SCRT_Domain")
    - Add your SCRT URL for the embedded service deployment
    - Ensure the "Active" checkbox is selected
    - Click "Save"

5. Configure Trusted URLs:

    - Navigate to Setup > Security > Trusted URLs
    - Click "New Trusted URL"
    - Add your SCRT URL for the embedded service deployment
    - Click "Save"

6. Configure OpenAI Settings:

    - Navigate to Setup > Custom Settings
    - Find "OpenAI Settings" and click "Manage"
    - Create a new record and enter your OpenAI API key

7. Configure Utter Sense Audio Recorder Settings:

    - Navigate to Setup > Custom Metadata Types
    - Find "Utter Sense Audio Recorder Config" and click "Manage Records"
    - Create a new configuration record with your desired settings
    - Note the Developer Name of your configuration as you'll need it for the next step

8. Configure the Audio Recorder Component:
    - When adding the Audio Recorder component to a Lightning Record Page
    - In the component's properties, locate "Configuration Developer Name"
    - Enter the Developer Name of the configuration you created in step 7
    - This allows you to specify which configuration the component should use

## Features 🌟

### Audio Recorder Component 🎙️

The Audio Recorder component enables seamless voice interaction within the Salesforce interface:

-   Real-time audio recording from user's microphone
-   Automatic transcription of voice input using OpenAI's Whisper API
-   Text-to-speech response playback for agent-generated content
-   Support for multiple audio input devices
-   Visual feedback during recording and playback

## Usage 🎮

Once deployed, follow these steps to use Utter Sense:

1. Navigate to the "Utter Sense" Lightning application in your Salesforce org
2. The Utter Sense component is automatically added to the Case Lightning Record Page
3. Open any case record to see the component in action
4. Use the Audio Recorder to:
    - Start/stop voice recording
    - Review transcribed text
    - Listen to agent responses
5. The component will automatically process voice input and provide real-time knowledge article recommendations based on the conversation

## Contributors 👥

<!-- spellchecker: disable -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%">
        <a href="https://github.com/valon-loshaj">
          <img src="https://github.com/valon-loshaj.png" width="100px;" alt="Valon Loshaj"/>
          <br />
          <sub><b>Valon Loshaj</b></sub>
        </a>
        <br />
        <sub>🎯 Project Creator</sub>
      </td>
    </tr>
  </tbody>
</table>
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- spellchecker: enable -->
