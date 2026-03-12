defmodule Trinity.NewsFetcher do
  @moduledoc """
  Scheduled Twitter scraping + Sonnet 4.6 summarization.
  Scrapes via Python/Scrapling, persists to ~/.trinity/news/.
  """
  use GenServer
  require Logger

  @target_hour 8
  @categories ~w(claude openai gemini)

  # ── Public API ──

  def start_link(_opts), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def get_news, do: GenServer.call(__MODULE__, :get_news)
  def get_config, do: GenServer.call(__MODULE__, :get_config)
  def get_status, do: GenServer.call(__MODULE__, :get_status)
  def update_config(config), do: GenServer.call(__MODULE__, {:update_config, config})
  def refresh, do: GenServer.cast(__MODULE__, :refresh)

  # ── Callbacks ──

  @impl true
  def init(_) do
    File.mkdir_p!(data_dir())

    state = %{
      status: :idle,
      config: load_config(),
      data: load_data(),
      timer_ref: nil
    }

    state = check_and_schedule(state)
    {:ok, state}
  end

  @impl true
  def handle_call(:get_news, _from, state), do: {:reply, state.data, state}
  def handle_call(:get_config, _from, state), do: {:reply, state.config, state}

  def handle_call(:get_status, _from, state) do
    {:reply, %{status: state.status, last_fetch: state.data["fetched_at"]}, state}
  end

  def handle_call({:update_config, new_config}, _from, state) do
    config =
      Enum.into(@categories, %{}, fn cat ->
        {cat, Map.get(new_config, cat, Map.get(new_config, String.to_atom(cat), []))}
      end)

    save_config(config)
    {:reply, :ok, %{state | config: config}}
  end

  @impl true
  def handle_cast(:refresh, %{status: :fetching} = state), do: {:noreply, state}

  def handle_cast(:refresh, state) do
    state = %{state | status: :fetching}
    send(self(), :do_fetch)
    {:noreply, state}
  end

  @impl true
  def handle_info(:scheduled_fetch, %{status: :fetching} = state), do: {:noreply, state}

  def handle_info(:scheduled_fetch, state) do
    if has_users?(state.config) do
      state = %{state | status: :fetching}
      send(self(), :do_fetch)
      {:noreply, state}
    else
      {:noreply, schedule_next(state)}
    end
  end

  def handle_info(:do_fetch, state) do
    Logger.info("[NewsFetcher] Starting news fetch...")
    pid = self()

    Task.start(fn ->
      result =
        try do
          do_fetch(state.config)
        catch
          kind, reason ->
            Logger.error("[NewsFetcher] Task crashed: #{kind} #{inspect(reason)}")
            {:error, inspect(reason)}
        end

      send(pid, {:fetch_done, result})
    end)

    {:noreply, state}
  end

  def handle_info({:fetch_done, result}, state) do
    data =
      case result do
        {:ok, data} ->
          save_data(data)
          Phoenix.PubSub.broadcast(Trinity.PubSub, "news", {:news_updated, data})
          Logger.info("[NewsFetcher] News fetch completed")
          data

        {:error, reason} ->
          Logger.error("[NewsFetcher] Fetch failed: #{inspect(reason)}")
          state.data
      end

    state = %{state | status: :idle, data: data}
    state = schedule_next(state)
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  # ── Scheduling ──

  defp check_and_schedule(state) do
    {date, {hour, _, _}} = :calendar.local_time()
    today = date_str(date)
    last_date = state.data["date"]

    cond do
      !has_users?(state.config) ->
        schedule_next(state)

      last_date == today ->
        schedule_next(state)

      hour >= @target_hour ->
        # Past 8am, haven't fetched → fetch now
        state = %{state | status: :fetching}
        send(self(), :do_fetch)
        state

      true ->
        schedule_at_target(state)
    end
  end

  defp schedule_next(state) do
    if state.timer_ref, do: Process.cancel_timer(state.timer_ref)

    {_date, {hour, min, _}} = :calendar.local_time()
    now_secs = hour * 3600 + min * 60
    target_secs = @target_hour * 3600

    until =
      if now_secs < target_secs,
        do: target_secs - now_secs,
        else: 86_400 - now_secs + target_secs

    ref = Process.send_after(self(), :scheduled_fetch, until * 1000)
    Logger.info("[NewsFetcher] Next fetch in #{div(until, 3600)}h #{rem(div(until, 60), 60)}m")
    %{state | timer_ref: ref}
  end

  defp schedule_at_target(state) do
    if state.timer_ref, do: Process.cancel_timer(state.timer_ref)

    {_date, {hour, min, _}} = :calendar.local_time()
    until = max(@target_hour * 3600 - (hour * 3600 + min * 60), 0)

    ref = Process.send_after(self(), :scheduled_fetch, until * 1000)
    Logger.info("[NewsFetcher] Scheduled for #{@target_hour}:00 (#{div(until, 60)}min)")
    %{state | timer_ref: ref}
  end

  # ── Fetch pipeline ──

  defp do_fetch(config) do
    # Phase 1: scrape tweets
    tweets_by_cat =
      Map.new(@categories, fn cat ->
        users = Map.get(config, cat, [])
        users = if is_list(users), do: users, else: []
        {cat, Enum.map(users, &scrape_tweet/1)}
      end)

    # Phase 2: summarize with Sonnet 4.6
    summaries = summarize_tweets(tweets_by_cat)

    # Build result
    {date, {h, m, _}} = :calendar.local_time()

    data = %{
      "date" => date_str(date),
      "fetched_at" => "#{date_str(date)} #{pad(h)}:#{pad(m)}",
      "categories" =>
        Map.new(@categories, fn cat ->
          {cat, %{
            "tweets" => Map.get(tweets_by_cat, cat, []),
            "summary" => Map.get(summaries, cat, "")
          }}
        end)
    }

    {:ok, data}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp scrape_tweet(username) do
    script = script_path()

    case System.cmd("python3", [script, username],
           env: [{"PYTHONIOENCODING", "utf-8"}]
         ) do
      {output, 0} ->
        # Take only the last line (JSON), skip any log lines
        json_line = output |> String.trim() |> String.split("\n") |> List.last() || ""
        case Jason.decode(json_line) do
          {:ok, result} -> result
          {:error, _} -> %{"ok" => false, "error" => "Invalid JSON output", "username" => username}
        end

      {output, _} ->
        %{"ok" => false, "error" => "Script failed: #{String.slice(output, 0, 200)}", "username" => username}
    end
  rescue
    e -> %{"ok" => false, "error" => Exception.message(e), "username" => username}
  end

  # ── Sonnet 4.6 summarization ──

  defp summarize_tweets(tweets_by_cat) do
    parts =
      @categories
      |> Enum.map(fn cat ->
        ok_tweets = tweets_by_cat |> Map.get(cat, []) |> Enum.filter(&(&1["ok"] == true))

        if ok_tweets == [] do
          nil
        else
          tweets_text =
            Enum.map_join(ok_tweets, "\n", fn t -> "@#{t["username"]}: #{t["text"]}" end)

          "## #{display_name(cat)}\n#{tweets_text}"
        end
      end)
      |> Enum.reject(&is_nil/1)

    Logger.info("[NewsFetcher] Summarize: #{length(parts)} categories with tweets")

    if parts == [] do
      %{}
    else
      prompt = """
      请用中文总结以下各 AI 公司推特账号的最新动态。对每个分类给出 2-3 句精炼摘要，提取关键信息（产品发布、技术突破、重要公告等）。语气简洁专业。

      #{Enum.join(parts, "\n\n")}

      请严格按以下 JSON 格式返回（不要包含 markdown 代码块标记）：
      {"claude": "摘要...", "openai": "摘要...", "gemini": "摘要..."}
      只返回有推特数据的分类。
      """

      case call_sonnet(prompt) do
        {:ok, text} ->
          Logger.info("[NewsFetcher] Sonnet response length: #{String.length(text)}")
          parse_json_response(text)

        {:error, reason} ->
          Logger.error("[NewsFetcher] Sonnet call failed: #{inspect(reason)}")
          %{}
      end
    end
  end

  defp call_sonnet(prompt) do
    Logger.info("[NewsFetcher] Calling Sonnet 4.6 for summarization...")

    case ClaudeAgentSDK.Streaming.start_session(%ClaudeAgentSDK.Options{
           model: "sonnet",
           effort: :high,
           system_prompt: %{type: :preset, preset: :claude_code},
           permission_mode: :bypass_permissions,
           cwd: System.user_home!(),
           include_partial_messages: true
         }) do
      {:ok, session} ->
        response =
          session
          |> ClaudeAgentSDK.Streaming.send_message(prompt)
          |> Enum.reduce("", fn event, acc ->
            case Trinity.StreamEventParser.to_sse(event) do
              %{type: "text", content: text} -> acc <> text
              _ -> acc
            end
          end)

        ClaudeAgentSDK.Streaming.close_session(session)
        {:ok, response}

      {:error, reason} ->
        Logger.error("[NewsFetcher] Sonnet session failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp parse_json_response(text) do
    cleaned =
      text
      |> String.trim()
      |> String.replace(~r/^```json\s*/s, "")
      |> String.replace(~r/\s*```$/s, "")
      |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, map} when is_map(map) ->
        map

      _ ->
        case Regex.run(~r/\{[^}]+\}/s, text) do
          [json] ->
            case Jason.decode(json) do
              {:ok, map} when is_map(map) -> map
              _ -> %{}
            end

          _ ->
            %{}
        end
    end
  end

  # ── Helpers ──

  defp has_users?(config) do
    Enum.any?(@categories, fn cat ->
      users = Map.get(config, cat, [])
      is_list(users) and users != []
    end)
  end

  defp display_name("claude"), do: "Claude (Anthropic)"
  defp display_name("openai"), do: "OpenAI"
  defp display_name("gemini"), do: "Gemini (Google)"
  defp display_name(other), do: other

  defp script_path do
    [
      Path.expand("scripts/scrape_tweet.py", File.cwd!()),
      Path.expand("backend/scripts/scrape_tweet.py", File.cwd!())
    ]
    |> Enum.find(fn p -> File.exists?(p) end)
    |> Kernel.||(Path.expand("scripts/scrape_tweet.py", File.cwd!()))
  end

  defp data_dir, do: Path.join(System.user_home!(), ".trinity/news")
  defp data_file, do: Path.join(data_dir(), "data.json")
  defp config_file, do: Path.join(data_dir(), "config.json")

  defp load_config do
    case File.read(config_file()) do
      {:ok, content} ->
        case Jason.decode(content) do
          {:ok, config} when is_map(config) -> config
          _ -> default_config()
        end

      _ ->
        default_config()
    end
  end

  defp default_config, do: %{"claude" => [], "openai" => [], "gemini" => []}

  defp save_config(config), do: File.write!(config_file(), Jason.encode!(config, pretty: true))

  defp load_data do
    case File.read(data_file()) do
      {:ok, content} ->
        case Jason.decode(content) do
          {:ok, data} when is_map(data) -> data
          _ -> %{}
        end

      _ ->
        %{}
    end
  end

  defp save_data(data), do: File.write!(data_file(), Jason.encode!(data, pretty: true))

  defp date_str({y, m, d}), do: "#{y}-#{pad(m)}-#{pad(d)}"
  defp pad(n) when n < 10, do: "0#{n}"
  defp pad(n), do: "#{n}"
end
