export default {
  appId: 'com.iskeletakip.app',
  productName: 'IskeleTakip',
  directories: {
    output: 'release',
  },
  publish: [
    {
      provider: 'github',
      owner: 'erenzdn',
      repo: 'Iskele-Takip-Frontend',
    },
  ],
  files: ['dist-web/**/*', 'dist-electron/**/*', 'package.json', 'LICENSE.txt'],
  win: {
    target: ['nsis'],
    signAndEditExecutable: false, // Symlink hatasını önlemek için imzalama devre dışı
    // icon: 'assets/icon.ico',  // assets/icon.ico ekledikten sonra aktif edin
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // Kurulum sihirbazı ve kaldırma programı ikonları (assets/icon.ico ekledikten sonra aktif edin)
    // installerIcon: 'assets/icon.ico',
    // uninstallerIcon: 'assets/icon.ico',
    // Kısayollar
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'İskele Takip',
    // Lisans metni (kurulum sırasında kabul ekranı gösterir)
    license: 'LICENSE.txt',
  },
};

