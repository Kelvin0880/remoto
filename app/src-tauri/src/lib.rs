mod input;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            input::move_mouse,
            input::mouse_click,
            input::mouse_scroll,
            input::key_press,
            input::type_text,
        ])
        .run(tauri::generate_context!())
        .expect("error corriendo la aplicación de Remoto");
}
