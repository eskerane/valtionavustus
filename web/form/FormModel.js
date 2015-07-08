import Bacon from 'baconjs'
import _ from 'lodash'
import Dispatcher from './Dispatcher'
import LocalStorage from './LocalStorage.js'
import FormBranchGrower from './FormBranchGrower.js'
import InputValueStorage from './InputValueStorage.js'
import FormUtil from './FormUtil.js'
import JsUtil from './JsUtil.js'
import qwest from 'qwest'
import queryString from 'query-string'
import traverse from 'traverse'

const dispatcher = new Dispatcher()

const events = {
  initialState: 'initialState',
  updateField: 'updateField',
  uiStateUpdate: 'uiStateUpdate',
  fieldValidation: 'fieldValidation',
  changeLanguage: 'changeLanguage',
  save: 'save',
  saveCompleted: 'saveCompleted',
  submit: 'submit',
  removeField: 'removeField'
}

export default class FormModel {
  constructor(props) {
    this.formOperations = props.formOperations
    this.initialStateTransformation = props.initialStateTransformation
    this.formP = props.formP
    this.customComponentFactory = props.customComponentFactory
  }

  init() {
    const self = this
    const query = queryString.parse(location.search)
    const langQueryParam =  query.lang || 'fi'
    const previewQueryParam =  query.preview || false
    const develQueryParam =  query.devel || false

    const formValuesP = self.formOperations.containsExistingEntityId(query) ?
      Bacon.fromPromise(qwest.get(self.formOperations.urlCreator.existingFormApiUrlFromQuery(query))).map(function(submission){return submission.answers}) :
      self.formP.map(initDefaultValues)
    const clientSideValidationP = self.formP.map(initClientSideValidationState)
    const translationsP = Bacon.fromPromise(qwest.get("/translations.json"))

    const initialStateObject = {
      form: self.formP,
      saveStatus: {
        changes: false,
        saveInProgress: false,
        saveTime: null,
        values: formValuesP
      },
      configuration: {
        preview: previewQueryParam,
        develMode: develQueryParam,
        lang: langQueryParam,
        translations: translationsP
      },
      validationErrors: {},
      clientSideValidation: clientSideValidationP
    }
    self.initialStateTransformation(initialStateObject)

    const initialState = Bacon.combineTemplate(initialStateObject)
    initialState.onValue(function(state) { dispatcher.push(events.initialState, state) })

    const autoSave = _.debounce(function(){dispatcher.push(events.save)}, develQueryParam? 100 : 3000)
    function autoSaveIfAllowed(state) {
      if (self.formOperations.isSaveDraftAllowed(state)) {
        state.saveStatus.saveInProgress = true
        autoSave()
      }
    }

    const formFieldValuesP = Bacon.update({},
                                          [dispatcher.stream(events.initialState)], onInitialState,
                                          [dispatcher.stream(events.updateField)], onUpdateField,
                                          [dispatcher.stream(events.uiStateUpdate)], onUiStateUpdated,
                                          [dispatcher.stream(events.fieldValidation)], onFieldValidation,
                                          [dispatcher.stream(events.changeLanguage)], onChangeLang,
                                          [dispatcher.stream(events.save)], onSave,
                                          [dispatcher.stream(events.saveCompleted)], onSaveCompleted,
                                          [dispatcher.stream(events.submit)], onSubmit,
                                          [dispatcher.stream(events.removeField)], onRemoveField)

    return formFieldValuesP.filter((value) => { return !_.isEmpty(value) })

    function initDefaultValues(form) {
      const values = {}
      const fields = JsUtil.flatFilter(form.content, n => { return !_.isUndefined(n.id) })
      _.forEach(fields, f => {
        if (!_.isEmpty(f.options)) {
          InputValueStorage.writeValue(form.content, values, f.id, f.options[0].value)
        }
      })
      return values
    }

    function initClientSideValidationState(form) {
      const values = {}
      const children = form.children ? form.children : form.content
      for (var i = 0; i < children.length; i++) {
        const field = children[i]
        if (field.type === 'formField') {
          values[field.id] = false
        } else if (field.type === 'wrapperElement') {
          var childValues = initClientSideValidationState(field)
          for (var fieldId in childValues) {
            values[fieldId] = childValues[fieldId]
          }
        }
      }
      return values
    }

    function onInitialState(state, realInitialState) {
      try {
        addFormFieldsForGrowingFields(realInitialState.form.content, realInitialState.saveStatus.values)
      } catch (e) {
        console.log('Error when updating initial state', e)
        throw e
      }
      return realInitialState
    }

    function addFormFieldsForGrowingFields(formContent, answers) {
      function populateRepeatingItem(baseObject, key, valueOfElement) {
        _.assign(baseObject, { "id": key })
        baseObject.children = baseObject.children.map(c => {
          const primitiveElement = _.cloneDeep(c)
          const distinguisherOfElement = _.last(primitiveElement.id.split('.')) // e.g. "email"
          _.forEach(valueOfElement, primitiveElementValueObject => {
            if (_.endsWith(primitiveElementValueObject.key, '.' + distinguisherOfElement)) {
              primitiveElement.id = primitiveElementValueObject.key
            }
          })
          return primitiveElement
        })
        return baseObject
      }

      function populateGrowingSet(growingParentElement, valuesTreeOfElement) {
        if (growingParentElement.children.length === 0) {
          throw new Error("Expected an existing child for growing set '" + growingParentElement.id + "' to get the field configurations from there.")
        }
        const childPrototype = growingParentElement.children[0]
        growingParentElement.children = _.map(valuesTreeOfElement, itemValueObject => {
          const o = {}
          _.assign(o, childPrototype)
          populateRepeatingItem(o, itemValueObject.key, itemValueObject.value)
          return o
        })
      }

      _.forEach(JsUtil.flatFilter(formContent, n => { return n.displayAs === "growingFieldset"}), g => {
        const growingSetValue = InputValueStorage.readValue(formContent, answers, g.id)
        if (!_.isUndefined(growingSetValue) && !_.isEmpty(growingSetValue)) {
          populateGrowingSet(g, growingSetValue)
        }
        const firstChildValue = g.children.length > 0 ? InputValueStorage.readValue(formContent, answers, g.children[0].id) : undefined
        if (g.children.length > 1 || (!_.isUndefined(growingSetValue) && !_.isUndefined(firstChildValue))) {
          const enabledPlaceHolderChild = FormBranchGrower.createNewChild(g, true)
          g.children.push(enabledPlaceHolderChild)
        }
        const disabledPlaceHolderChild = FormBranchGrower.createNewChild(g, false)
        g.children.push(disabledPlaceHolderChild)
      })
    }


    function onChangeLang(state, lang) {
      state.configuration.lang = lang
      return state
    }

    function onUpdateField(state, fieldUpdate) {
      updateStateFromFieldUpdate(state, fieldUpdate)
      triggerRelatedFieldValidationIfNeeded(state, fieldUpdate)
      const clientSideValidationPassed = state.clientSideValidation[fieldUpdate.id]
      if (clientSideValidationPassed) {
        if (growingFieldSetExpandMustBeTriggered(state, fieldUpdate)) {
          expandGrowingFieldset(state, fieldUpdate)
        }
        self.formOperations.onFieldValid(state, self, fieldUpdate.id, fieldUpdate.value)
      }
      state.saveStatus.changes = true
      autoSaveIfAllowed(state)
      dispatcher.push(events.uiStateUpdate, fieldUpdate)
      return state
    }

    function growingFieldSetExpandMustBeTriggered(state, fieldUpdate) {
      const growingSetOfThisField = fieldUpdate.growingParent
      if (!growingSetOfThisField) {
        return false
      }

      const allFieldIdsInSameGrowingSet = JsUtil.
        flatFilter(growingSetOfThisField, n => { return !_.isUndefined(n.id) }).
        map(n => { return n.id })
      const wholeSetIsValid = _.reduce(allFieldIdsInSameGrowingSet, (acc, fieldId) => {
        return acc && (state.clientSideValidation[fieldId] !== false)
      }, true)

      // TODO: Assess if the "last" check is needed. Possibly it's enough that the whole thing is valid, minus last row that needs to be skipped in validation, when there are filled rows.
      const lastChildOfGrowingSet = _.last(_.filter(growingSetOfThisField.children, f => { return !f.forceDisabled }))
      const thisFieldIsInLastChildToBeRepeated = _.some(lastChildOfGrowingSet.children, x => { return x.id === fieldUpdate.id })

      return wholeSetIsValid && thisFieldIsInLastChildToBeRepeated
    }

    function expandGrowingFieldset(state, fieldUpdate) {
      const growingFieldSet = fieldUpdate.growingParent
      _.forEach(JsUtil.flatFilter(growingFieldSet.children, n => { return !_.isUndefined(n.id) }), n => {
        n.forceDisabled = false
      })
      const allExistingFieldIds = JsUtil.flatFilter(state.form.content, n => { return !_.isUndefined(n.id) }).
        map(n => { return n.id })
      const newSet = FormBranchGrower.createNewChild(growingFieldSet)
      growingFieldSet.children.push(newSet)
    }

    function triggerRelatedFieldValidationIfNeeded(state, triggeringFieldUpdate) {
      const growingFieldSet = triggeringFieldUpdate.growingParent
      if (growingFieldSet) {
        const triggeringFieldId = triggeringFieldUpdate.id
        const myGroup = JsUtil.findJsonNodeContainingId(growingFieldSet.children, triggeringFieldId)
        const fieldsToValidate = JsUtil.flatFilter(myGroup, f => { return !_.isUndefined(f.id) && f.type === "formField" && f.id !== triggeringFieldId })
        _.forEach(fieldsToValidate, relatedField => {
          const relatedFieldValue = InputValueStorage.readValue(state.form.content, state.saveStatus.values, relatedField.id)
          const relatedFieldUpdate = FormModel.createFieldUpdate(relatedField, relatedFieldValue)
          updateStateFromFieldUpdate(state, relatedFieldUpdate)
        })
        return !_.isEmpty(fieldsToValidate)
      }
      return false
    }

    function onUiStateUpdated(state, fieldUpdate) {
      LocalStorage.save(self.formOperations.createUiStateIdentifier, state, fieldUpdate)
      return state
    }

    function onFieldValidation(state, validation) {
      state.clientSideValidation[validation.id] = validation.validationErrors.length === 0
      if (self.isSaveDraftAllowed(state)) {
        state.validationErrors[validation.id] = validation.validationErrors
      }
      return state
    }

    function handleUnexpectedSaveError(state, method, url, error, submit) {
      if (submit) {
        console.error("Unexpected save error ", error, " in ", method, " to ", url)
        state.validationErrors["submit"] = [{error: "unexpected-submit-error"}]
      } else {
        autoSaveIfAllowed(state)
      }
      return state
    }

    function handleSaveError(state, status, error, method, url, response, submit) {
      console.log('handleSaveError : error ', JSON.stringify(error))
      console.log('handleSaveError : response ', JSON.stringify(response))
      state.saveStatus.saveInProgress = false
      if (status === 400) {
        state.validationErrors = JSON.parse(response)
        state.validationErrors["submit"] = [{error: "validation-errors"}]
        return state
      }
      return handleUnexpectedSaveError(state, method, url, error, submit);
    }

    function saveNew(state, onSuccessCallback) {
      var url = self.formOperations.urlCreator.newEntityApiUrl(state)
      try {
        state.saveStatus.saveInProgress = true
        qwest.put(url, state.saveStatus.values, {dataType: "json", async: true})
            .then(function(response) {
              console.log("State saved. Response=", JSON.stringify(response))
              if (onSuccessCallback) {
                onSuccessCallback(state, response)
              }
              var stateSkeletonFromServer = _.cloneDeep(state)
              stateSkeletonFromServer.saveStatus.values = null // state from server is not loaded at all on initial save, so this will be null
              dispatcher.push(events.saveCompleted, stateSkeletonFromServer)
            })
            .catch(function(error) {
              handleSaveError(state, this.status, error, this.method, url, this.response)
            })
      }
      catch(error) {
        return handleUnexpectedSaveError(state, "PUT", url, error);
      }
      return state
    }

    function updateOld(stateToSave, submit, onSuccessCallback) {
      var url = self.formOperations.urlCreator.existingFormApiUrl(stateToSave)+ (submit ? "/submit" : "")
      try {
        stateToSave.saveStatus.saveInProgress = true
        qwest.post(url, stateToSave.saveStatus.values, {dataType: "json", async: true})
            .then(function(response) {
              console.log("Saved to server (submit=", submit, "). Response=", JSON.stringify(response))
              const stateFromServer = _.cloneDeep(stateToSave)
              stateFromServer.saveStatus.values = response["answers"]
              if (onSuccessCallback) {
                onSuccessCallback(stateFromServer)
              }
              dispatcher.push(events.saveCompleted, stateFromServer)
            })
            .catch(function(error) {
              handleSaveError(stateToSave, this.status, error, this.method, url, this.response, submit)
            })
      }
      catch(error) {
        handleUnexpectedSaveError(stateToSave, "POST", url, error, submit);
      }
      return stateToSave
    }

    function onSave(state, params) {
      const onSuccessCallback = params ? params.onSuccessCallback : undefined
      if (self.formOperations.isSaveDraftAllowed(state)) {
        return updateOld(state, false, onSuccessCallback)
      }
      else {
        return saveNew(state, onSuccessCallback)
      }
    }

    function onSaveCompleted(stateFromUiLoop, stateFromServer) {
      // TODO: Resolve updates from UI with updates from server.
      // At the moment we just discard the values from server here.
      var locallyStoredValues = LocalStorage.load(self.formOperations.createUiStateIdentifier, stateFromServer)
      if (!locallyStoredValues) {
        LocalStorage.save(self.formOperations.createUiStateIdentifier, stateFromServer)
        stateFromServer.saveStatus.saveInProgress = false
        stateFromServer.saveStatus.saveTime = new Date()
        stateFromServer.saveStatus.changes = false
        return stateFromServer
      }
      stateFromUiLoop.saveStatus.changes = !_.isEqual(stateFromUiLoop.saveStatus.values, stateFromServer.saveStatus.values)
      self.formOperations.onSaveCompletedCallback(stateFromUiLoop, stateFromServer)
      stateFromUiLoop.saveStatus.saveInProgress = false
      stateFromUiLoop.saveStatus.saveTime = new Date()
      stateFromUiLoop.validationErrors["submit"] = []
      if (stateFromUiLoop.saveStatus.changes) {
        autoSaveIfAllowed(stateFromUiLoop)
      }
      return stateFromUiLoop
    }

    function onSubmit(state) {
      return updateOld(state, true)
    }

    function updateStateFromFieldUpdate(state, fieldUpdate) {
      const growingParentIfFound = InputValueStorage.writeValue(state.form, state.saveStatus.values, fieldUpdate.id, fieldUpdate.value)
      fieldUpdate.growingParent = growingParentIfFound
      if (fieldUpdate.validationErrors) {
        state.validationErrors[fieldUpdate.id] = fieldUpdate.validationErrors
        state.clientSideValidation[fieldUpdate.id] = fieldUpdate.validationErrors.length === 0
      } else {
        state.clientSideValidation[fieldUpdate.id] = true
      }
    }

    function onRemoveField(state, fieldToRemove) {
      const growingParent = FormUtil.findGrowingParent(state.form.content, fieldToRemove.id)
      const answersObject = state.saveStatus.values
      InputValueStorage.deleteValue(growingParent, answersObject, fieldToRemove.id)
      delete state.clientSideValidation[fieldToRemove.id]
      _.remove(growingParent.children, fieldToRemove)
      autoSaveIfAllowed(state)
      return state
    }
  }

  static createFieldUpdate(field, value) {
    return {id: field.id, value: value, validationErrors: FormModel.validateSyntax(field, value)};
  }

  static validateSyntax(field, value) {
    var validationErrors = []
    if (field.required && (!value || _.trim(value).length < 1)) {
      validationErrors = [{error: "required"}]
    }

    if (field.displayAs === 'emailField' && value) {
      var emailError = FormModel.validateEmail(value);
      if (emailError) {
        validationErrors.push(emailError)
      }
    }

    return validationErrors
  }

  static validateEmail(input) {
    function lastPartIsLongerThanOne(email) {
      const parts = email.split('\.')
      return parts[parts.length -1].length > 1
    }
    // Pretty basic regexp, allows anything@anything.anything
    const validEmailRegexp = /\S+@\S+\.\S+/
    const validEmail = validEmailRegexp.test(input) && lastPartIsLongerThanOne(input)
    return validEmail ? undefined : {error: "email"};
  }

  // Public API

  constructHtmlId(formContent, fieldId) {
    return fieldId // For the time being, our field ids are unique within the form
  }

  changeLanguage(lang) {
    dispatcher.push(events.changeLanguage, lang)
  }

  setFieldValid(id, validationErrors) {
    dispatcher.push(events.fieldValidation, {id: id, validationErrors: validationErrors})
  }

  submit(event) {
    event.preventDefault()
    dispatcher.push(events.submit)
  }

  saveImmediately(callback) {
    dispatcher.push(events.save, { onSuccessCallback: callback })
  }

  hasPendingChanges(state) {
    return state.saveStatus.changes || state.saveStatus.saveInProgress
  }

  componentOnChangeListener(field, newValue) {
    dispatcher.push(events.updateField, FormModel.createFieldUpdate(field, newValue))
  }

  componentDidMount(field, initialValue) {
    if (field.skipValidationOnMount) {
      field.skipValidationOnMount = false
      return
    }
    dispatcher.push(events.fieldValidation, {id: field.id, validationErrors: FormModel.validateSyntax(field, initialValue)})
  }

  isSaveDraftAllowed(state) {
    return this.formOperations.isSaveDraftAllowed(state)
  }

  removeField(field) {
    dispatcher.push(events.removeField, field)
  }

  getCustomComponentTypeMapping() {
    return this.customComponentFactory ? this.customComponentFactory.componentTypeMapping : {}
  }

  createCustomComponent(componentProps) {
    if (!this.customComponentFactory) {
      throw new Error("To create a custom field, supply customComponentFactory to FormModel")
    }
    return this.customComponentFactory.createComponent(componentProps)
  }
}
