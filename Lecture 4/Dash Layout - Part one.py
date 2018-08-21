##dashboards로 웹에 연결 및 interact가능
##Dash apps은 두가지를 함축하고있다.
##첫번째는 앱의 Layout과 application을 보여준다
##두번째는 application의 interact를 decribe한다.
##Dash는 순전히 Python에서 제공한다.
##dash는 두가지의 Library를 제공한다
##첫번째는 dash_html_components로 HTML tag를 위한 component를 가진 Library이다.
##두번째는 dash_core_components로 JavaScript, HTML, CSS를 생성하는 Library이다. through the React.js

import dash
import dash_core_components as dcc
import dash_html_components as html

app = dash.Dash()       ##dash app 생성

app.layout = html.Div(children=[        ##app layout call
            html.H1('Hello Dash!'),
            html.Div('Dash : Web Dashboards with Python'),
            dcc.Graph(id='example',     ##graph object, dcc means core components
                        figure=dict(data=[
                                    {'x':[1,2,3],'y':[4,1,2], 'type':'bar','name':'SF'},
                                    {'x':[1,2,3],'y':[2,4,5], 'type':'bar','name':'NYC'}],
                                    layout={
                                    'title':'BAR PLOTS!'
                                    }))
])

if __name__ == '__main__':
    app.run_server()
