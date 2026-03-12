defmodule TrinityWeb.NewsController do
  use TrinityWeb, :controller

  def index(conn, _params) do
    news = Trinity.NewsFetcher.get_news()
    config = Trinity.NewsFetcher.get_config()
    %{status: status, last_fetch: last_fetch} = Trinity.NewsFetcher.get_status()

    json(conn, %{
      news: news,
      config: config,
      status: status,
      last_fetch: last_fetch
    })
  end

  def refresh(conn, _params) do
    Trinity.NewsFetcher.refresh()
    json(conn, %{ok: true})
  end

  def update_config(conn, %{"config" => config}) do
    Trinity.NewsFetcher.update_config(config)
    json(conn, %{ok: true})
  end

  def update_config(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Missing config"})
  end
end
