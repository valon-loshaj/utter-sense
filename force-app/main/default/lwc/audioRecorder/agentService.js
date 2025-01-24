import getAgentResponseApex from "@salesforce/apex/AudioRecorderController.getAgentResponse";

export class AgentService {
	constructor() {
		this.apexMethod = getAgentResponseApex;
	}

	async getAgentResponse(input) {
		return await this.apexMethod({ input });
	}
}
