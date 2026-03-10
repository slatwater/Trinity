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
  end
end
