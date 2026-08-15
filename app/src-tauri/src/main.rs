// Punto de entrada de Remoto (Windows: sin consola visible en release).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    remoto_lib::run();
}
