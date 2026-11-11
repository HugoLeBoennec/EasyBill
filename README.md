# 📊 EasyBill

> A modern, cross-platform desktop invoicing application for freelancers and small businesses

EasyBill is an open-source billing and invoicing solution built with Electron, React, and TypeScript. It offers a simple yet powerful interface to manage your invoices, quotes and customers, and to prepare for French e-invoicing regulations.

---

## ⚠️ Important Disclaimer

**This project is currently in active development and maintained in my free time with the assistance of AI (Claude).**

**USE AT YOUR OWN RISK:**
- This application is **not yet commercial-grade**
- Features may be incomplete or contain bugs
- Data backup is **your responsibility**
- No warranty or guarantee is provided
- Suitable for testing and personal use, not recommended for critical business operations yet

If you encounter issues or have suggestions, please open an issue on GitHub!

---

## ✨ Why Choose EasyBill?

### 🆓 Free & Open Source
- No subscription fees
- No hidden costs
- Full control over your data
- Community-driven development

### 🖥️ Cross-Platform
- Windows, macOS, and Linux support
- Consistent experience across all platforms
- Desktop application with offline capabilities

### 🇫🇷 Preparing for French E-Invoicing
- Factur-X, UBL, and CII format generation
- Settings screen for the platform you plan to use (Chorus Pro, Tiime, Pennylane, Sage...)
- **Transmission to Chorus Pro or any other platform is not implemented yet** (see Upcoming Features)

### 💾 Privacy-First
- All data stored locally on your machine
- No cloud dependency
- Backup and restore of the database file from the settings page
- You own your data

### 🎨 Modern & Intuitive
- Clean, responsive interface
- Easy-to-use invoice creation
- Customer management
- Dashboard with analytics

---

## 🚀 Features

### Current Features

✅ **Invoice Management**
- Create, edit, and delete invoices
- PDF generation
- Invoice status tracking

✅ **Quotes (devis)** — being added now
- Create and edit quotes, follow their status

✅ **Customer Management**
- Customer database
- SIREN/SIRET validation for French businesses

✅ **Company Profile**
- Seller legal identity (legal name, legal form, SIRET/SIREN, VAT number, address, contact)
- SIRET and VAT number validation, French VAT number computed from the SIREN

✅ **Dashboard**
- Amounts awaiting payment and overdue
- Counts of quotes, invoices, and customers

✅ **E-Invoicing groundwork (French compliance)**
- Factur-X, UBL, and CII format generation
- Platform settings storage (platform, environment, credentials)
- Local queue table for invoices awaiting transmission
- Nothing is sent to any platform yet

✅ **Settings**
- Database backup and restore
- Interface in French or English, following the system language (some screens are French only)

### 🔜 Upcoming Features

- 📤 Transmission of invoices to Chorus Pro / an approved platform (PA) — **not implemented**: today the app only stores the platform settings, generates the formats, and keeps a local queue
- 📥 Reception of electronic invoices
- 🏦 Remaining legal mentions on the company profile: share capital, RCS registration, APE/NAF code, IBAN/BIC, VAT franchise mention (art. 293 B du CGI)
- 📧 Email integration for sending invoices
- 💰 Payment tracking and reminders
- 📈 Advanced analytics and reporting
- 🔄 Recurring invoices
- 🌍 Multi-currency support
- 🧾 Expense tracking

---

## 📦 Installation

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### From Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/HugoLeBoennec/EasyBill.git
   cd EasyBill
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

### Build for Production

```bash
# Package the application for your current platform (output in out/)
npm run package

# Build distributable installers (output in out/make/)
npm run make
```

---

## 📖 Documentation

### User Guides

- [Chorus Pro Setup Guide](docs/CHORUS_PRO_SETUP_GUIDE.md) - How to obtain your Chorus Pro credentials and configure e-invoicing
- [French E-Invoicing Compliance](docs/french-einvoicing-compliance.md) - Understanding the 2026 mandatory e-invoicing regulations

### Technical Documentation

- [Architecture Overview](docs/architecture-einvoicing.md) - System architecture and design decisions
- [Implementation Log](docs/IMPLEMENTATION_LOG.md) - Development progress and decisions

---

## 🛠️ Technology Stack

- **Framework**: Electron 39
- **UI**: React 19, TailwindCSS
- **Language**: TypeScript
- **Database**: SQLite via better-sqlite3 (local storage)
- **PDF Generation**: pdf-lib
- **Build**: Vite, Electron Forge

---

## 🗺️ Roadmap

### Milestone 1: Core Stability (Current)
- ✅ Basic invoice and customer management
- ✅ PDF generation
- ✅ Company profile, database backup and restore
- ✅ French e-invoicing foundation (formats, settings, local queue)
- 🔄 Quotes (devis)
- 🔄 Bug fixes and stability improvements
- 🔄 Comprehensive testing

### Milestone 2: E-Invoicing Polish
- 📋 Complete Factur-X implementation
- 📋 UBL and CII generators
- 📋 Chorus Pro / approved platform transmission (not started)
- 📋 Invoice reception workflow

### Milestone 3: Feature Expansion
- 📋 Payment tracking
- 📋 Recurring invoices
- 📋 Email integration
- 📋 Advanced reporting

### Milestone 4: Commercial Grade
- 📋 Comprehensive test coverage
- 📋 Security audit
- 📋 Performance optimization
- 📋 Professional documentation
- 📋 1.0 release

---

## 🤝 Contributing

Contributions are welcome! This project is developed with the help of AI (Claude by Anthropic), which helps accelerate development while maintaining code quality.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style (ESLint configured)
- Write clear commit messages
- Update documentation for new features
- Test your changes thoroughly

---

## 🐛 Known Issues & Limitations

- **Database migrations**: Back up the database (Settings → Sauvegarde) before updates
- **E-invoicing**: Invoices are not transmitted to Chorus Pro or any other platform; only format generation, settings, and a local queue exist
- **Credentials**: E-invoicing platform credentials are stored unencrypted in the app's local storage
- **Company profile**: Share capital, RCS, APE/NAF code, IBAN/BIC and the VAT franchise mention cannot be stored yet
- **Performance**: Large invoice databases (>10,000) may experience slowdown
- **Testing**: Test coverage is currently limited
- **Platform-specific bugs**: Some features may behave differently across platforms

For a complete list of issues, see the [GitHub Issues](https://github.com/HugoLeBoennec/EasyBill/issues) page.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

### Built With Help From

- **Claude AI** (Anthropic) - AI assistant that helps with development, architecture decisions, and code generation
- **Electron React Boilerplate** - Initial project structure
- **Open Source Community** - Various libraries and tools

### Resources

- [DGFiP](https://www.impots.gouv.fr/) - French tax authority documentation
- [PISTE Platform](https://developer.aife.economie.gouv.fr/) - API documentation for Chorus Pro
- [Factur-X](https://fnfe-mpe.org/factur-x/) - Electronic invoicing standard

---

## 💬 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/HugoLeBoennec/EasyBill/issues)
- **Discussions**: [GitHub Discussions](https://github.com/HugoLeBoennec/EasyBill/discussions)

---

## 📊 Project Status

![Status](https://img.shields.io/badge/status-alpha-orange)
![Development](https://img.shields.io/badge/development-active-green)
![License](https://img.shields.io/badge/license-MIT-blue)

**Current Version**: Alpha (Pre-1.0)

**Development Status**: Active development, maintained during free time

**Production Ready**: ❌ Not yet

**Recommended For**: Testing, personal use, learning

---

## 🎯 Project Goals

1. **Simplicity**: Make invoicing as simple as possible for freelancers and small businesses
2. **Privacy**: Keep user data local and secure
3. **Compliance**: Help French businesses prepare for 2026 mandatory e-invoicing
4. **Open Source**: Provide a free, community-driven alternative to commercial solutions
5. **Quality**: Eventually reach commercial-grade quality through iterative improvements

---

## 🔐 Security Notice

This is an early-stage project. Please:

- ✅ Keep regular backups of your data
- ✅ Use strong credentials for e-invoicing platforms
- ✅ Test thoroughly in qualification/sandbox environments first
- ✅ Report security issues privately (see security policy)
- ❌ Don't use for critical production data yet

---

## 📸 Screenshots

*Coming soon - UI screenshots will be added as the interface stabilizes*

---

## ⭐ Star History

If you find this project useful, please consider giving it a star on GitHub! It helps others discover the project and motivates continued development.

---

<div align="center">

**Made with ❤️ and ⚡ AI assistance**

**Built by developers, for developers**

[⬆ Back to top](#-easybill)

</div>
