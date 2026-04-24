{pkgs}: {
  deps = [
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.alsa-lib
    pkgs.dbus
    pkgs.cairo
    pkgs.pango
    pkgs.libdrm
    pkgs.expat
    pkgs.cups
    pkgs.atk
    pkgs.nss
    pkgs.nspr
    pkgs.glib
  ];
}
