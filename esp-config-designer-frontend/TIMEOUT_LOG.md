INFO Selected serial port. Starting compile for wyswietlacz-kolorowy.yaml
INFO CMD: esphome config /config/ecd/wyswietlacz-kolorowy.yaml
INFO ESPHome 2026.1.4
INFO Reading configuration /config/ecd/wyswietlacz-kolorowy.yaml...
WARNING GPIO3 is a strapping PIN and should only be used for I/O with care.
Attaching external pullup/down resistors to strapping pins can cause unexpected failures.
See https://esphome.io/guides/faq/#why-am-i-getting-a-warning-about-strapping-pins
esphome:
  friendly_name: WYświetlacz kolorowy
  name: wyswietlacz-kolorowy
  min_version: 2026.1.4
  build_path: build/wyswietlacz-kolorowy
  platformio_options: {}
  environment_variables: {}
  includes: []
  includes_c: []
  libraries: []
  name_add_mac_suffix: false
  debug_scheduler: false
  areas: []
  devices: []
esp32:
  variant: ESP32S3
  framework:
    type: esp-idf
    version: 5.5.2
    sdkconfig_options: {}
    log_level: ERROR
    advanced:
      compiler_optimization: SIZE
      enable_idf_experimental_features: false
      enable_lwip_assert: true
      ignore_efuse_custom_mac: false
      ignore_efuse_mac_crc: false
      enable_lwip_mdns_queries: true
      enable_lwip_bridge_interface: false
      enable_lwip_tcpip_core_locking: true
      enable_lwip_check_thread_safety: true
      disable_libc_locks_in_iram: true
      disable_vfs_support_termios: true
      disable_vfs_support_select: true
      disable_vfs_support_dir: true
      freertos_in_iram: false
      ringbuf_in_iram: false
      heap_in_iram: false
      execute_from_psram: false
      loop_task_stack_size: 8192
      enable_ota_rollback: true
    components: []
    platform_version: https://github.com/pioarduino/platform-espressif32/releases/download/55.03.35/platform-espressif32.zip
    source: pioarduino/framework-espidf@https://github.com/pioarduino/esp-idf/releases/download/v5.5.2/esp-idf-v5.5.2.tar.xz
  flash_size: 4MB
  board: esp32-s3-devkitc-1
  cpu_frequency: 160MHZ
wifi:
  ap:
    ssid: \033[5mWYświetlacz kolorowy Fallback Ho\033[6m
    password: \033[5mfuyvgEJ3feGr\033[6m
    ap_timeout: 90s
  domain: .local
  reboot_timeout: 15min
  power_save_mode: LIGHT
  fast_connect: false
  enable_btm: false
  enable_rrm: false
  passive_scan: false
  enable_on_boot: true
  post_connect_roaming: true
  min_auth_mode: WPA2
  networks:
    - ssid: \033[5m!secret 'wifi_ssid'\033[6m
      password: \033[5m!secret 'wifi_password'\033[6m
      priority: 0
  use_address: wyswietlacz-kolorowy.local
captive_portal:
  compression: gzip
ota:
  - platform: web_server
  - platform: esphome
    password: \033[5mf144f4e417aeb1b4e733d7e820d87861\033[6m
    version: 2
    port: 3232
api:
  encryption:
    key: \033[5m6ECeJyl6fL73jivg/n1AwLKngGLyjsHaemhB4xhAHl0=\033[6m
  port: 6053
  reboot_timeout: 15min
  batch_delay: 100ms
  custom_services: false
  homeassistant_services: false
  homeassistant_states: false
  listen_backlog: 4
  max_connections: 8
  max_send_queue: 8
logger:
  level: DEBUG
  baud_rate: 115200
  tx_buffer_size: 512
  deassert_rts_dtr: false
  task_log_buffer_size: 768
  hardware_uart: USB_SERIAL_JTAG
  logs: {}
  runtime_tag_levels: false
spi:
  - mosi_pin:
      number: 17
      mode:
        output: true
        input: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    miso_pin:
      number: 16
      mode:
        input: true
        output: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    clk_pin:
      number: 15
      mode:
        output: true
        input: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    interface: any
    type: single
    interface_index: 0
display:
  - platform: ssd1331_spi
    dc_pin:
      number: 3
      mode:
        output: true
        input: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    cs_pin:
      number: 8
      mode:
        output: true
        input: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    reset_pin:
      number: 18
      mode:
        output: true
        input: false
        open_drain: false
        pullup: false
        pulldown: false
      inverted: false
      ignore_pin_validation_error: false
      ignore_strapping_warning: false
      drive_strength: 20.0
    update_interval: 1s
    lambda: !lambda |-
      it.filled_circle(76, 20, 14, Color(0x38BDF8));
      it.filled_triangle(4, 4, 52, 4, 52, 60, Color(0xFACC15));
      it.filled_triangle(4, 4, 52, 60, 4, 60, Color(0xFACC15));
    auto_clear_enabled: unspecified
    brightness: 1.0
INFO Configuration is valid!
INFO CMD: esphome compile /config/ecd/wyswietlacz-kolorowy.yaml
INFO ESPHome 2026.1.4
INFO Reading configuration /config/ecd/wyswietlacz-kolorowy.yaml...
WARNING GPIO3 is a strapping PIN and should only be used for I/O with care.
Attaching external pullup/down resistors to strapping pins can cause unexpected failures.
See https://esphome.io/guides/faq/#why-am-i-getting-a-warning-about-strapping-pins
INFO Generating C++ source...
INFO Setting CONFIG_LWIP_MAX_SOCKETS to 11 (registered: api=4, captive_portal=4, mdns=2, ota=1)
INFO Compiling app... Build path: /data/build/wyswietlacz-kolorowy
Processing wyswietlacz-kolorowy (board: esp32-s3-devkitc-1; framework: espidf; platform: https://github.com/pioarduino/platform-espressif32/releases/download/55.03.35/platform-espressif32.zip)
--------------------------------------------------------------------------------
HARDWARE: ESP32S3 240MHz, 320KB RAM, 4MB Flash
 - contrib-piohome @ 3.4.4 
 - framework-espidf @ 3.50502.0 (5.5.2) 
 - tool-cmake @ 4.0.3 
 - tool-esp-rom-elfs @ 2024.10.11 
 - tool-esptoolpy @ 5.1.0 
 - tool-mklittlefs @ 3.2.0 
 - tool-ninja @ 1.13.1 
 - tool-scons @ 4.40801.0 (4.8.1) 
 - toolchain-xtensa-esp-elf @ 14.2.0+20251107
Reading CMake configuration...
Dependency Graph
|-- noise-c @ 0.1.10
RAM:   [=         ]  10.9% (used 35864 bytes from 327680 bytes)
Flash: [=====     ]  49.4% (used 906679 bytes from 1835008 bytes)
========================= [SUCCESS] Took 15.89 seconds =========================
INFO Build Info: config_hash=0x37f37de5 build_time_str=2026-02-12 16:07:16 +0100
INFO Successfully compiled program.
INFO Compile successful. Starting serial flash...
INFO Downloading factory firmware from add-on...
INFO Starting flash...
esptool.js
Serial port WebSerial VendorID 0x303a ProductID 0x1001
Connecting...
.


Detecting chip type... 
ESP32-S3
Chip is ESP32-S3
Features: Wi-Fi,BLE,Embedded PSRAM 8MB (AP_3v3)
Crystal is 40MHz
MAC: 30:ed:a0:a7:4f:c4
Uploading stub...
Running stub...
Stub running...
Changing baudrate to 921600
ERROR Timeout