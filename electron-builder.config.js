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
      releaseType: 'release',
    },
  ],
  files: ['dist-web/**/*', 'dist-electron/**/*', 'package.json', 'LICENSE.txt'],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    signAndEditExecutable: false,
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

