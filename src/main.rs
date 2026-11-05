// No console window for the GUI in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gui;

fn main() -> eframe::Result {
    // A panic inside a window callback aborts the process without a readable message
    // (Windows reports 0xc000041d), so record it in the log first.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let bt = std::backtrace::Backtrace::force_capture();
        peerhop::util::log("PANIC", format_args!("{info}\n{bt}"));
        default_hook(info);
    }));

    let files = peerhop::platform::cli_files();
    // A second launch hands its files to the running window and exits.
    if !peerhop::platform::acquire_single_instance(&files) {
        return Ok(());
    }
    gui::run(files)
}
