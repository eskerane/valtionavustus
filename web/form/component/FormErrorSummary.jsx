import React from 'react'
import LocalizedString from './LocalizedString.jsx'
import Translator from './../Translator.js'

export default class FormErrorSummary extends React.Component {

  constructor(props) {
    super(props)
    this.translations = this.props.translations
    this.handleClick = this.handleClick.bind(this)
    this.state = { open: false }
  }

  handleClick() {
    this.setState({
      open: !this.state.open
    })
  }

  getField(id, field, parents) {
    if(field && field.id === id) {
      return {field: field, parents: parents}
    }
    if(field.children) {
      return this.findField(id, field.children, parents.concat([field]))
    }
    return undefined
  }

  findField(id, fields, parents) {
    for (var i=0; i < fields.length; i++) {
      const fieldInfo = this.getField(id, fields[i], parents)
      if(fieldInfo) {
        return fieldInfo
      }
    }
    return undefined
  }

  renderFieldErrors(fieldInfo, errors, lang) {
    if(fieldInfo) {
      const fieldErrors = []
      const labelHolder = fieldInfo.field.label ? fieldInfo.field : fieldInfo.parents[fieldInfo.parents.length - 1]
      for (var i=0; i < errors.length; i++) {
        const error = errors[i]
        const key = fieldInfo.field.id + "-validation-error-" + error.error
        if(fieldErrors.length > 0){
          fieldErrors.push(<span key={key + "-separator"}>, </span>)
        }
        fieldErrors.push( <LocalizedString key={key} translations={this.translations} translationKey={error.error} lang={lang} />)
      }
      return <div className="error" key={fieldInfo.field.id + "-validation-error"}>
              <LocalizedString translations={labelHolder} translationKey="label" defaultValue={fieldInfo.field.id} lang={lang} /><span>: </span>
              {fieldErrors}
            </div>
    }
    return undefined
  }

  render() {
    const lang = this.props.lang
    const fields = this.props.fields
    const validationErrors = this.props.validationErrors
    const translator = new Translator(this.translations)
    const saveError = this.props.saveError.length > 0 ? translator.translate(this.props.saveError, lang) : ""
    const children = []
    var invalidFieldsCount = 0
    if (validationErrors instanceof Object) {
      for (var fieldId in validationErrors) {
        const errors = validationErrors[fieldId]
        if(errors.length > 0) {
          invalidFieldsCount++
          const fieldErrors = this.renderFieldErrors(this.findField(fieldId, fields, []), errors, lang)
          if(fieldErrors) {
            children.push(fieldErrors)
          }
        }
      }
    }
    return (
      <div id="form-error-summary" hidden={invalidFieldsCount === 0 && saveError.length === 0}>
        <div hidden={saveError.length === 0} className="error">{saveError}</div>
        <a onClick={this.handleClick} role="button" className="error" id="validation-errors-summary" hidden={invalidFieldsCount === 0}>
          {translator.translate("validation-errors", lang, null, {kpl: invalidFieldsCount})}
        </a>
        <div className="popup" hidden={!this.state.open || invalidFieldsCount === 0} id="validation-errors">
          <a role="button" className="popup-close" onClick={this.handleClick}>&times;</a>
          {children}
        </div>
      </div>
    )
  }
}
