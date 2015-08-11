(function() {
  var loginPage = LoginPage()

  beforeEach(function () {
    window.localStorage.clear()
  })

  afterEach(function () {
    if (this.currentTest.state == 'failed') {
      takeScreenshot()
    }
    expect(window.uiError || null).to.be.null
  })

  describe('Sisäänkirjautuminen', function() {
    before(
      loginPage.openLoginPage()
    )

    describe('sisäänkirjautumissivulla', function() {
      it("näkyy haun nimi", function() {
        expect(loginPage.applicationName()).to.deep.equal('Ammatillinen koulutus - Ammatillisen peruskoulutuksen laadun kehittäminen')
      })

      it("alkutilassa hakemuksen luonti on disabloitu", function() {
        expect(loginPage.submitButton().isEnabled()).to.equal(false)
      })

      it("mikäli syöttää jotain muuta kuin sähköpostiosoitteen", function() {
        loginPage.setInputValue("primary-email", "notanemailaddress")()
        expect(loginPage.classAttributeOf("primary-email")).to.include('error')
        expect(loginPage.submitButton().isEnabled()).to.equal(false)
      })

      it("mikäli syöttää oikean sähköpostiosoitteen", function() {
        loginPage.setInputValue("primary-email", "yhteyshenkilo@example.com")()
        expect(loginPage.submitButton().isEnabled()).to.equal(true)
      })

      describe("kun luo hakemuksen", function() {
        before(
          mockAjax.init,
          function() { mockAjax.respondOnce("PUT", "/api/avustushaku/1/hakemus", 200,
            {
              "submission": {
                "answers": {
                  "value":[{"value":"yhteyshenkilo@example.com","key":"primary-email"},{"value":"fi","key":"language"}]},
                  "version_closed":null,"version":0,"form":1,"created_at":"2015-08-11T11:23:40Z","id":91
              },
              "verified_at":null,"created_at":"2015-08-11T11:23:40Z","status":"draft","id":""
            })
          },
          loginPage.waitUntilSubmitIsEnabled,
          loginPage.submitButton().click
        )

        it("Näkyy viesti", function() {
          expect(loginPage.message().text()).to.equal("Sähköpostiin on lähetetty linkki hakulomakkeelle. Tämän sivun voi sulkea.")
        })

      })
    })
  })

  describe('ruotsinkielisellä sisäänkirjautumissivulla', function() {
    before(
      loginPage.openLoginPage('sv')
    )

    it("näkyy haun nimi ruotsiksi", function() {
      expect(loginPage.applicationName()).to.deep.equal('Stöd för genomförande av kvalitetsstrategin')
    })
  })
})()