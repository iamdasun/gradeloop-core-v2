#!/usr/bin/env python3
"""
tui.py — Terminal User Interface for Clone Detection Management.
Powered by Textual.
"""

from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Button, Static, Input, Label, Select, Log, Checkbox
from textual.containers import Container, Horizontal, Vertical
from textual import on, work
import subprocess
import os
import sys
from pathlib import Path

# Fix path for imports if needed
sys.path.insert(0, str(Path(__file__).parent))

class CloneDetectionTUI(App):
    """A Textual app to manage clone detection scripts."""

    CSS = """
    Screen {
        background: #1a1a1a;
    }

    #sidebar {
        width: 30;
        background: #262626;
        border-right: solid #333;
        padding: 1;
    }

    #main_content {
        padding: 1;
    }

    .section-title {
        text-style: bold;
        margin-bottom: 1;
        color: #00d7ff;
    }

    .form-item {
        margin-bottom: 1;
    }

    Log {
        background: #000;
        color: #00ff00;
        border: solid #333;
        height: 1fr;
        margin-top: 1;
    }

    Button {
        width: 100%;
        margin-top: 1;
    }

    #run-btn {
        background: #008700;
    }

    #run-btn:hover {
        background: #00af00;
    }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("c", "clear_log", "Clear Log"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        
        with Horizontal():
            with Vertical(id="sidebar"):
                yield Label("TASK SELECTION", classes="section-title")
                yield Select(
                    [
                        ("Train Syntactic Model", "train"),
                        ("Evaluate Syntactic Service", "evaluate"),
                        ("Evaluate BCB (Legacy)", "evaluate_bcb"),
                    ],
                    id="task-select",
                    value="evaluate"
                )
                
                yield Label("\nARGUMENTS", classes="section-title")
                
                with Vertical(classes="form-item"):
                    yield Label("Sample Size:")
                    yield Input(placeholder="e.g. 5000", id="sample-size", value="1000")
                
                with Vertical(classes="form-item"):
                    yield Label("Model Name:")
                    yield Input(placeholder="type3_xgb.pkl", id="model-name", value="type3_xgb.pkl")
                
                with Horizontal(classes="form-item"):
                    yield Checkbox("Enable CV", value=True, id="enable-cv")
                    yield Checkbox("Disable Node Types", value=False, id="no-node-types")
                
                yield Button("RUN SCRIPT", variant="success", id="run-btn")
                yield Button("CLEAR LOG", variant="default", id="clear-btn")
                
            with Vertical(id="main_content"):
                yield Label("OUTPUT CONSOLE", classes="section-title")
                yield Log(id="console-log", highlight=True)
        
        yield Footer()

    def action_clear_log(self) -> None:
        self.query_one("#console-log", Log).clear()

    @on(Button.Pressed, "#clear-btn")
    def handle_clear(self) -> None:
        self.action_clear_log()

    @on(Button.Pressed, "#run-btn")
    def handle_run(self) -> None:
        task = self.query_one("#task-select", Select).value
        sample_size = self.query_one("#sample-size", Input).value
        model_name = self.query_one("#model-name", Input).value
        enable_cv = self.query_one("#enable-cv", Checkbox).value
        no_node_types = self.query_one("#no-node-types", Checkbox).value

        # Build command
        cmd = []
        if task == "train":
            cmd = ["poetry", "run", "python", "train.py"]
            if sample_size: cmd.extend(["--sample-size", sample_size])
            if model_name: cmd.extend(["--model-name", model_name])
            if not enable_cv: cmd.append("--no-cv")
            if no_node_types: cmd.append("--no-node-types")
        elif task == "evaluate":
            cmd = ["poetry", "run", "python", "evaluate.py"]
            if sample_size: cmd.extend(["--sample-size", sample_size])
            if model_name: cmd.extend(["--model", model_name])
            if no_node_types: cmd.append("--no-node-types")
        elif task == "evaluate_bcb":
            # Jump to the legacy service script
            script_path = Path(__file__).parent.parent.parent / "cipas-service" / "scripts" / "evaluate_bcb.py"
            cmd = ["python", str(script_path)]
            if sample_size: cmd.extend(["--sample-size", sample_size])

        if not cmd:
            self.query_one("#console-log", Log).write_line("[bold red]Error: Unknown task selection[/]")
            return

        self.run_script_async(cmd)

    @work(exclusive=True, thread=True)
    def run_script_async(self, cmd: list[str]) -> None:
        log = self.query_one("#console-log", Log)
        log.write_line(f"[bold cyan]EXECUTING:[/] {' '.join(cmd)}")
        log.write_line("-" * 40)

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=os.environ.copy()
        )

        for line in iter(process.stdout.readline, ""):
            if line:
                # Textual Log widget handles rich-style tags or plain text
                # We strip the newline as write_line adds one
                log.write_line(line.strip())
        
        process.stdout.close()
        return_code = process.wait()
        
        if return_code == 0:
            log.write_line("\n[bold green]SUCCESS: Script finished successfully.[/]")
        else:
            log.write_line(f"\n[bold red]FAILURE: Script exited with code {return_code}.[/]")
        log.write_line("-" * 40)

if __name__ == "__main__":
    app = CloneDetectionTUI()
    app.run()
