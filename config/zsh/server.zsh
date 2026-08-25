kserver() {
  if ! command -v lsof >/dev/null 2>&1; then
    echo "kserver needs lsof (brew install lsof / apt install lsof)"
    return 1
  fi
  echo "Finding running developer server processes..."
  echo ""

  server_info=$(lsof -iTCP -sTCP:LISTEN -n -P | grep -v "COMMAND")

  if [ -z "$server_info" ]; then
    echo "No running developer server processes found."
    return 0
  fi

  declare -a pid_list
  declare -a command_list
  declare -a port_list

  declare -a dev_commands=("node" "python" "python3" "uv" "go" "java" "npm" "yarn" "pnpm" "bun" "deno" "cargo" "ruby" "php" "artisan" "uvicorn" "gunicorn" "dotnet" "main")

  while read -r line; do
    pid=$(echo "$line" | awk '{print $2}')
    command=$(echo "$line" | awk '{print $1}')
    port_with_proto=$(echo "$line" | awk '{print $9}')
    port=$(echo "$port_with_proto" | awk -F':' '{print $NF}')

    is_dev_command=0
    for cmd in "${dev_commands[@]}"; do
      if [[ "$command" == *"$cmd"* ]]; then
        is_dev_command=1
        break
      fi
    done

    full_command=$(ps -p "$pid" -o command= 2>/dev/null)

    if [[ "$full_command" == *go\ run* || "$full_command" == *npm\ run* || "$full_command" == *yarn\ start* || "$full_command" == *pnpm\ run* || "$full_command" == *bun\ run* || "$full_command" == *uv\ run* || "$full_command" == *php\ artisan\ serve* ]]; then
      is_dev_command=1
    fi

    if [ "$is_dev_command" -eq 1 ]; then
      if ! [[ " ${pid_list[@]} " =~ " ${pid} " ]]; then
        pid_list+=("$pid")
        command_list+=("$full_command")
        port_list+=("$port")
      fi
    fi
  done <<< "$server_info"

  if [ ${#pid_list[@]} -eq 0 ]; then
    echo "No running developer server processes found."
    return 0
  fi

  echo "Available server processes to kill:"
  echo ""

  temp_file=$(mktemp)
  echo "#:PID:Port:Command" > "$temp_file"

  i=1
  while [ "$i" -le "${#pid_list[@]}" ]; do
    pid="${pid_list[$i]}"
    port="${port_list[$i]}"
    full_cmd="${command_list[$i]}"

    if [[ "$full_cmd" == *php\ artisan\ serve* ]]; then
      display_cmd="php artisan serve"
    elif [[ "$full_cmd" == *go\ run* ]]; then
      display_cmd="go run"
    elif [[ "$full_cmd" == *go-build* && "$full_cmd" == */main ]]; then
      display_cmd="go run main.go"
    elif [[ "$full_cmd" == *uv\ run* ]]; then
      display_cmd="uv run"
    elif [[ "$full_cmd" == *http.server* ]]; then
      display_cmd="python3 -m http.server"
    elif [[ "$full_cmd" == *npm\ run* ]]; then
      display_cmd="npm run"
    elif [[ "$full_cmd" == *yarn\ start* ]]; then
      display_cmd="yarn start"
    elif [[ "$full_cmd" == *pnpm\ run* ]]; then
      display_cmd="pnpm run"
    elif [[ "$full_cmd" == *bun\ run* ]]; then
      display_cmd="bun run"
    else
      display_cmd=$(basename "$full_cmd")
      if [[ "$display_cmd" == *"/"* ]]; then
        display_cmd=$(echo "$full_cmd" | awk '{print $1}' | sed 's:.*/::')
      fi
    fi

    if [[ ${#display_cmd} -gt 50 ]]; then
      display_cmd=$(echo "$display_cmd" | cut -c1-47)...
    fi

    echo "$i:$pid:$port:$display_cmd" >> "$temp_file"
    i=$((i+1))
  done

  column -t -s ':' "$temp_file" | sed -e 's/^/  /'
  rm "$temp_file"

  echo ""
  echo -n "Enter the number of the process to kill (or 'q' to quit): "
  read selection

  if [[ "$selection" == "q" ]]; then
    echo "Exiting."
    return 0
  fi

  if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    echo "Invalid input. Please enter a number."
    return 1
  fi

  if [[ "$selection" -lt 1 || "$selection" -gt "${#pid_list[@]}" ]]; then
    echo "Invalid selection: $selection."
    return 1
  fi

  pid_to_kill="${pid_list[$selection]}"

  echo ""
  echo -n "Are you sure you want to kill PID $pid_to_kill? (y/n): "
  read confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    echo "Killing PID $pid_to_kill..."
    kill "$pid_to_kill"
    echo "Done."
  else
    echo "Aborted."
  fi
}
