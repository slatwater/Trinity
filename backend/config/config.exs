import Config

config :trinity,
  generators: [timestamp_type: :utc_datetime]

config :trinity, TrinityWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: TrinityWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Trinity.PubSub

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
