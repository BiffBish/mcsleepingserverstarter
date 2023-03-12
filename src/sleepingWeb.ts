import express, { Express } from "express";
import { existsSync } from "fs";
import { engine } from "express-handlebars";
import * as http from "http";
import path from "path";
import { SleepingContainer } from "./sleepingContainer.js";
import { ServerStatus } from "./sleepingHelper.js";
import { getLogger, LoggerType } from "./sleepingLogger.js";
import { ISleepingServer } from "./sleepingServerInterface.js";
import { DefaultFavIconString, Settings } from "./sleepingSettings.js";
import { PlayerConnectionCallBackType } from "./sleepingTypes.js";

export class SleepingWeb implements ISleepingServer {
  settings: Settings;
  sleepingContainer: SleepingContainer;
  playerConnectionCallBack: PlayerConnectionCallBackType;
  logger: LoggerType;
  app: Express;
  server?: http.Server;

  constructor(
    settings: Settings,
    playerConnectionCallBack: PlayerConnectionCallBackType,
    sleepingContainer: SleepingContainer
  ) {
    this.settings = settings;
    this.playerConnectionCallBack = playerConnectionCallBack;
    this.sleepingContainer = sleepingContainer;
    this.logger = getLogger();
    this.app = express();
  }

  init = async () => {
    this.app.engine(
      "hbs",
      engine({
        defaultLayout: "main",
        layoutsDir: path.join(__dirname, "./views/layouts/"),
        extname: ".hbs",
        helpers: {
          title: () => {
            return this.settings.serverName;
          },
          favIcon: () => {
            return this.settings.favIcon || DefaultFavIconString;
          },
        },
      })
    );

    this.app.set("view engine", "hbs");
    this.app.use(express.static(path.join(__dirname, "./views")));

    if (this.settings.webServeDynmap) {
      let dynmapPath;
      if (typeof this.settings.webServeDynmap === "string") {
        dynmapPath = this.settings.webServeDynmap;
      } else {
        dynmapPath = "./plugins/dynmap/web/";
        if (!existsSync(dynmapPath)) {
          dynmapPath = path.join(__dirname, "../plugins/dynmap/web/");
        }
      }
      this.logger.info(`[WebServer] Serving dynmap: ${dynmapPath}`);
      if (existsSync(dynmapPath)) {
        this.app.use("/dynmap", express.static(dynmapPath));
      }
    }

    this.app.get("/", (req, res) => {
      res.render(path.join(__dirname, "./views/home"), {
        message: this.settings.loginMessage,
      });
    });

    this.app.post("/wakeup", async (req, res) => {
      res.send("received");

      const currentStatus = await this.sleepingContainer.getStatus();
      switch (currentStatus) {
        case ServerStatus.Sleeping:
          {
            this.logger.info(
              `[WebServer](${req.socket.remoteAddress}) Wake up server was ${currentStatus}`
            );
            this.playerConnectionCallBack("A WebUser");
          }
          break;
        case ServerStatus.Running:
          {
            this.logger.info(
              `[WebServer](${req.socket.remoteAddress}) Stopping server was ${currentStatus}`
            );
            this.sleepingContainer.killMinecraft();
          }
          break;
        case ServerStatus.Starting:
          {
            this.logger.info(
              `[WebServer](${req.socket.remoteAddress}) Doing nothing server was ${currentStatus}`
            );
          }
          break;
        default: {
          this.logger.warn(
            `[WebServer](${req.socket.remoteAddress}) Server is ?! ${currentStatus}`
          );
        }
      }
    });

    this.app.get("/status", async (req, res) => {
      const status = await this.sleepingContainer.getStatus();
      res.json({ status, dynmap: this.settings.webServeDynmap });
    });

    this.server = this.app.listen(this.settings.webPort, () => {
      this.logger.info(
        `[WebServer] Starting web server on *: ${this.settings.webPort}`
      );
    });
  };

  close = async () => {
    if (this.server) {
      this.server.close();
    }
  };
}
