import React from 'react'
import LocalizedString from './LocalizedString.jsx'
import _ from 'lodash'

export default class FormElementError extends React.Component {
  render() {
    if(this.props.validationErrors) {
      var errors = []
      for (var i=0; i < this.props.validationErrors.length; i++) {
        var error = this.props.validationErrors[i].error
        var translations = _.get(this.props.translations.errors, error, {default: error})
        errors.push(<LocalizedString key={error} data={translations} lang={this.props.lang} />)
      }
      return (<div className="error">{errors}</div>)
    }
    return (<span className="error"/>)
  }
}