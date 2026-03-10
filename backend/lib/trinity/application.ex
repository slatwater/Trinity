defmodule Trinity.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      TrinityWeb.Telemetry,
      {Phoenix.PubSub, name: Trinity.PubSub},
      {Registry, keys: :unique, name: Trinity.SessionRegistry},
      {Registry, keys: :unique, name: Trinity.AutoPilotRegistry},
      {DynamicSupervisor, name: Trinity.SessionManager, strategy: :one_for_one},
      {DynamicSupervisor, name: Trinity.AutoPilotManager, strategy: :one_for_one},
      TrinityWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Trinity.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    TrinityWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
