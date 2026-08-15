// Comandos de Rust invocables desde el frontend para inyectar input en esta máquina
// (el lado que ESTÁ SIENDO controlado). Usa el crate `enigo`, que en Windows implementa
// esto sobre la API nativa SendInput.
//
// Limitación conocida: Windows UIPI bloquea SendInput hacia ventanas elevadas (UAC) desde un
// proceso no elevado. Si el usuario necesita controlar una ventana "Ejecutar como
// administrador", Remoto también debe correr elevado (fuera de alcance para v1).
use enigo::{Axis, Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use std::sync::Mutex;

static ENIGO: Mutex<Option<Enigo>> = Mutex::new(None);

fn with_enigo<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut Enigo) -> Result<R, String>,
{
    let mut guard = ENIGO.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(Enigo::new(&Settings::default()).map_err(|e| e.to_string())?);
    }
    f(guard.as_mut().unwrap())
}

#[tauri::command]
pub fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    with_enigo(|e| e.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn mouse_click(button: String) -> Result<(), String> {
    let btn = match button.as_str() {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    with_enigo(|e| e.button(btn, Direction::Click).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn mouse_scroll(delta_y: i32) -> Result<(), String> {
    with_enigo(|e| e.scroll(delta_y, Axis::Vertical).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn key_press(key: String) -> Result<(), String> {
    let ch = key.chars().next().unwrap_or(' ');
    with_enigo(|e| {
        e.key(enigo::Key::Unicode(ch), Direction::Click)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn type_text(text: String) -> Result<(), String> {
    with_enigo(|e| e.text(&text).map_err(|e| e.to_string()))
}
