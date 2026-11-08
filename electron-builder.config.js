export default {
  appId: 'com.iskeletakip.app',
  productName: 'IskeleTakip',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  publish: [
    {
      provider: 'github',
      owner: 'erenzdn',
      repo: 'Iskele-Takip-Frontend',
      releaseType: 'release',
      // GitHub API kullan, atom feed değil
      private: false,
      // Güncelleme kontrolü için direkt API kullan
      protocol: 'https',
    },
  ],
  files: ['dist-web/**/*', 'dist-electron/**/*', 'package.json', 'LICENSE.txt'],
  win: {
    icon: 'build/icons/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    signAndEditExecutable: true,
  },
  nsis: {
    oneClick: true,
    allowToChangeInstallationDirectory: false,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'İskele Takip',
    license: 'LICENSE.txt',
  },
};

