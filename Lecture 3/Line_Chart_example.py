import numpy as np
import plotly.offline as pyo
import plotly.graph_objs as go

np.random.seed(56)

x_values = np.linspace(0, 1, 100)
y_values = np.random.randn(100) ##randn returns Standard distribution

trace0 = go.Scatter(x=x_values,          ##Define Scatter Charts
                    y=y_values+5,
                    mode='markers',
                    name='markers')      ##name means just name for variable
                                         ##name will be using for legends for charts
trace1 = go.Scatter(x=x_values,
                    y=y_values,
                    mode='lines',
                    name='myline')

trace2 = go.Scatter(x=x_values,
                    y=y_values-5,
                    mode='lines+markers',
                    name='myfavorite')
data = [trace0, trace1, trace2]                          ##Define Data lists

layout = go.Layout(title='Line Charts') ##Define Layout

fig = go.Figure(data=data, layout=layout) ##Set figure out
pyo.plot(fig)
