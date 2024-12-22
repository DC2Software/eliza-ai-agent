import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import {
    AgentRuntime,
    elizaLogger,
    validateCharacterConfig,
} from "@ai16z/eliza";

import { REST, Routes } from "discord.js";

export function createApiRouter(agents: Map<string, AgentRuntime>, directClient) {
    const router = express.Router();
    const apiKey = process.env.DIRECT_CLIENT_API_KEY;
    const checkAuth = (req, res): boolean => {
        const authHeader = req.headers.authorization;
        if ((apiKey && apiKey.length > 0) && (!authHeader || !authHeader.includes(apiKey))) {
            res.sendStatus(403);
            return false;
        }
        return true;
    }

    router.use(cors());
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));

    router.get("/", (req, res) => {
        if (!checkAuth(req, res)) return;
        res.send("Welcome, this is the REST API!");
    });

    router.get("/hello", (req, res) => {
        if (!checkAuth(req, res)) return;
        res.json({ message: "Hello World!" });
    });

    router.get("/agents", (req, res) => {
        if (!checkAuth(req, res)) return;
        const agentsList = Array.from(agents.values()).map((agent) => ({
            id: agent.agentId,
            name: agent.character.name,
            clients: Object.keys(agent.clients),
        }));
        res.json({ agents: agentsList });
    });

    router.get("/agents/:agentId", (req, res) => {
        if (!checkAuth(req, res)) return;
        const agentId = req.params.agentId;
        const agent = agents.get(agentId);

        if (!agent) {
            res.status(404).json({ error: "Agent not found" });
            return;
        }

        res.json({
            id: agent.agentId,
            character: agent.character,
        });
    });

    router.post("/agents/:agentId/set", async (req, res) => {
        if (!checkAuth(req, res)) return;
        const agentId = req.params.agentId;
        console.log('agentId', agentId)
        let agent:AgentRuntime = agents.get(agentId);

        // update character
        if (agent) {
            // stop agent
            agent.stop()
            directClient.unregisterAgent(agent)
            // if it has a different name, the agentId will change
        }

        // load character from body
        const character = req.body
        try {
          validateCharacterConfig(character)
        } catch(e) {
          elizaLogger.error(`Error parsing character: ${e}`);
          res.status(400).json({
            success: false,
            message: e.message,
          });
          return;
        }

        // start it up (and register it)
        agent = await directClient.startAgent(character)
        elizaLogger.log(`${character.name} started`)

        res.json({
            id: character.id,
            character: character,
        });
    });


    router.get("/agents/:agentId/channels", async (req, res) => {
        if (!checkAuth(req, res)) return;
        const agentId = req.params.agentId;
        const runtime = agents.get(agentId);

        if (!runtime) {
            res.status(404).json({ error: "Runtime not found" });
            return;
        }

        const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
        const rest = new REST({ version: "10" }).setToken(API_TOKEN);

        try {
            const guilds = (await rest.get(Routes.userGuilds())) as Array<any>;

            res.json({
                id: runtime.agentId,
                guilds: guilds,
                serverCount: guilds.length,
            });
        } catch (error) {
            console.error("Error fetching guilds:", error);
            res.status(500).json({ error: "Failed to fetch guilds" });
        }
    });

    return router;
}
