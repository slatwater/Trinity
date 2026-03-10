defmodule TrinityWeb.Router do
  use TrinityWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", TrinityWeb do
    pipe_through :api

    post "/chat", ChatController, :create
    get "/session", SessionController, :show
    delete "/session", SessionController, :delete
    get "/messages", SessionController, :messages
    get "/workflows", SessionController, :workflows

    post "/autopilot", AutoPilotController, :create
    get "/autopilot/:id", AutoPilotController, :show
    post "/autopilot/:id/message", AutoPilotController, :message
    post "/autopilot/:id/confirm", AutoPilotController, :confirm
    delete "/autopilot/:id", AutoPilotController, :delete
  end
end
